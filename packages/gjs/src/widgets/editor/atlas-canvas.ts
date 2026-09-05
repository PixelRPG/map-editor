import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import { SignalScope } from '../../utils/signal-scope.ts'
import {
  centeredScrollValue,
  clampPreviewZoom,
  type SceneRect,
  sceneRects,
  snapToGrid,
  surfaceSize,
  worldExtent,
} from './atlas-canvas.geometry.ts'
import Template from './atlas-canvas.blp'
import { MapPreview } from './map-preview'
import { SceneCard } from './scene-card'
import { TeleportOverlay } from './teleport-overlay'

GObject.type_ensure(SceneCard.$gtype)
GObject.type_ensure(TeleportOverlay.$gtype)
GObject.type_ensure(MapPreview.$gtype)

const SURFACE_PADDING = 180

/**
 * Grid step (atlas-space px) that dragged scene cards snap to on
 * release — keeps the world tidy + aligned instead of pixel-fuzzy.
 */
const ATLAS_GRID = 8

/**
 * Scrollable atlas surface — the "World" home view.
 *
 * Composition:
 * - `Gtk.ScrolledWindow` provides pan via native scroll / drag.
 * - `Gtk.Fixed` holds the scene cards at absolute atlas-space coords.
 *   `.atlas-surface` CSS paints the dotted backdrop.
 * - `Gtk.Overlay` lays a {@link TeleportOverlay} over the cards so the
 *   bezier teleport connections render on top.
 *
 * Selection: clicking a `SceneCard` updates the active id, emits
 * `scene-selected`, and dims unrelated teleports via the overlay.
 * Double-clicking (or pressing Enter on a focused card) emits
 * `scene-opened`, which the host handles to switch to the scene editor.
 */
export class AtlasCanvas extends Adw.Bin {
  /** Default native-pixel zoom of card previews (200%). */
  static readonly DEFAULT_PREVIEW_ZOOM = 2

  declare _scroller: Gtk.ScrolledWindow
  declare _overlay: Gtk.Overlay
  declare _surface: Gtk.Fixed
  declare _teleports: TeleportOverlay

  private _scenes: SampleScene[] = []
  private _teleportData: SampleTeleport[] = []
  private _cards: Map<string, SceneCard> = new Map()
  /** Live `MapPreview`s by scene id, for global zoom changes. */
  private _previews: Map<string, MapPreview> = new Map()
  private _selectedId: string | null = null
  private _projectResource: GameProjectResource | null = null
  /** Current global preview zoom — the atlas zoom control drives it. */
  private _previewZoom = AtlasCanvas.DEFAULT_PREVIEW_ZOOM
  private _contentW = 0
  private _contentH = 0
  /** Backdrop-pan gesture on the scroller; created on first map, kept for life. */
  private _panGesture: Gtk.GestureDrag | null = null
  /** Scroll offsets captured at pan start, so the drag delta is absolute. */
  private _panStart = { h: 0, v: 0 }
  private _signals = new SignalScope()
  /**
   * Holds the single deferred `fitToContent` waiting for the scroller's
   * first allocation. Separate from {@link _signals} so `fitToContent`
   * can supersede a pending fit without dropping the map-scoped
   * gesture handlers.
   */
  private _pendingFit = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAtlasCanvas',
        Template,
        InternalChildren: ['scroller', 'overlay', 'surface', 'teleports'],
        Properties: {
          'selected-id': GObject.ParamSpec.string(
            'selected-id',
            'Selected ID',
            'ID of the currently selected scene, or empty if none',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
        Signals: {
          // Fires on a **click-only** selection (no drag). Hosts treat
          // this as the "user wants to inspect this scene" intent —
          // safe to auto-open the inspector against it. See
          // `scene-drag-began` for the drag-start sibling, which
          // selects the scene + updates inspector content but should
          // NOT trigger auto-open.
          'scene-selected': { param_types: [GObject.TYPE_STRING] },
          // Fires on `scene-drag-begin`. Same `(sceneId,)` payload as
          // `scene-selected`. Decoupling the two lets the host
          // refresh the inspector content for the dragged scene
          // without popping the overlay drawer mid-drag — on
          // smartphone widths the drawer would otherwise cover the
          // canvas the moment the drag begins.
          'scene-drag-began': { param_types: [GObject.TYPE_STRING] },
          'scene-opened': { param_types: [GObject.TYPE_STRING] },
          'scene-moved': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT, GObject.TYPE_INT],
          },
          // Fires when a preview-viewport pan ends, with the new centre
          // in tile coordinates — hosts persist it as
          // `editorData.preview` (same flow as `scene-moved`).
          'preview-moved': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE],
          },
          // A card's viewport lock flipped (`true` = open/pannable) —
          // lets hosts mirror the state (e.g. the inspector's switch).
          'preview-lock-changed': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
          },
          // Emitted whenever the surface geometry changes (world set,
          // card moved) so the overview minimap can re-read scene rects
          // + content size. No payload — consumers pull via getters.
          'world-changed': {},
        },
      },
      AtlasCanvas,
    )
  }

  /**
   * Populate the canvas from sample-world descriptors. Pass the loaded
   * `GameProjectResource` to render real `MapPreview`s in each card
   * instead of the synthetic mini-map placeholder.
   */
  setWorld(
    scenes: SampleScene[],
    teleports: SampleTeleport[],
    projectResource: GameProjectResource | null = null,
  ): void {
    this._scenes = scenes
    this._teleportData = teleports
    this._projectResource = projectResource
    this._rebuildCards()
    this._teleports.setWorld(scenes, teleports, 1)
    this._sizeSurface()
    this.emit('world-changed')
  }

  get selectedId(): string {
    return this._selectedId ?? ''
  }

  set selectedId(value: string) {
    const newId = value || null
    if (this._selectedId === newId) return
    this._selectedId = newId
    for (const [id, card] of this._cards) {
      card.selected = id === newId
    }
    this._teleports.setSelected(newId)
    this.notify('selected-id')
  }

  get previewZoom(): number {
    return this._previewZoom
  }

  /**
   * Apply a new global preview zoom to every card (and to cards built
   * later). Clamped to a sane pixel-zoom range.
   */
  setPreviewZoom(zoom: number): void {
    const clamped = clampPreviewZoom(zoom)
    if (clamped === this._previewZoom) return
    this._previewZoom = clamped
    for (const preview of this._previews.values()) preview.setViewportZoom(clamped)
  }

  /**
   * Lock state of a card's preview viewport: `true` = open (drag pans
   * the section), `false` = closed, `null` = the scene has no viewport
   * preview (sample worlds / unknown id).
   */
  getPreviewLock(sceneId: string): boolean | null {
    const card = this._cards.get(sceneId)
    if (!card?.viewportLockable) return null
    return card.previewUnlocked
  }

  /** Flip a card's viewport lock (the inspector's switch drives this). */
  setPreviewLock(sceneId: string, unlocked: boolean): void {
    const card = this._cards.get(sceneId)
    if (card?.viewportLockable) card.previewUnlocked = unlocked
  }

  /** Total scrollable surface size (union of scene bboxes + padding). */
  get contentSize(): { width: number; height: number } {
    return { width: this._contentW, height: this._contentH }
  }

  /** Scene bounding boxes in atlas-surface coords — feeds the overview minimap. */
  sceneRects(): SceneRect[] {
    return sceneRects(this._scenes)
  }

  /** Current visible region in surface coords (scroll offset + page size). */
  viewportRect(): SceneRect {
    const h = this._scroller.hadjustment
    const v = this._scroller.vadjustment
    return { x: h.value, y: v.value, w: h.page_size, h: v.page_size }
  }

  /** The scroller's adjustments — hosts subscribe to `value-changed` for live overview sync. */
  get adjustments(): { h: Gtk.Adjustment; v: Gtk.Adjustment } {
    return { h: this._scroller.hadjustment, v: this._scroller.vadjustment }
  }

  /**
   * Scroll so the world's bounding box is centered in the viewport —
   * the atlas "fit" affordance. The Fixed surface has no fractional
   * scale (see class docstring), so this centers rather than zooms; the
   * overview minimap gives the whole-world-at-a-glance view. Deferred
   * until the scroller has a real page size (first allocation) so the
   * math isn't run against a zero viewport.
   */
  fitToContent(): void {
    const h = this._scroller.hadjustment
    const v = this._scroller.vadjustment
    const extent = worldExtent(this._scenes)
    const apply = (): void => {
      h.value = centeredScrollValue(extent.width, h.upper, h.page_size)
      v.value = centeredScrollValue(extent.height, v.upper, v.page_size)
    }
    // At most one deferred fit is ever pending: a second call before the
    // first allocation supersedes the first instead of stacking another
    // handler on the adjustment, and `vfunc_unmap` releases one that
    // never got its allocation.
    this._pendingFit.disconnectAll()
    if (h.page_size > 0) {
      apply()
      return
    }
    // Not yet allocated — run once the viewport gets a real size.
    this._pendingFit.connectUntil(h, 'notify::page-size', () => {
      if (h.page_size <= 0) return false
      apply()
      return true
    })
  }

  vfunc_map(): void {
    super.vfunc_map()
    const pan = this._ensurePanGesture()
    this._signals.connect(pan, 'drag-begin', (gesture: Gtk.GestureDrag, x: number, y: number) =>
      this._onPanBegin(gesture, x, y),
    )
    this._signals.connect(pan, 'drag-update', (_g: Gtk.GestureDrag, dx: number, dy: number) => {
      this._scroller.hadjustment.value = this._panStart.h - dx
      this._scroller.vadjustment.value = this._panStart.v - dy
    })
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    this._pendingFit.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Drag on the empty atlas backdrop pans the scrolled view (cards keep
   * their own gestures: content drag pans the preview, the corner
   * handle moves the card). The gesture lives on the SCROLLER — its
   * coordinates are viewport-stable, so adjusting the scroll position
   * doesn't shift the gesture's own reference frame (the same feedback
   * loop the cards' parent-space drag math guards against). Created
   * once and kept; `vfunc_unmap` releases its handlers, not the
   * controller.
   */
  private _ensurePanGesture(): Gtk.GestureDrag {
    if (this._panGesture) return this._panGesture
    const pan = new Gtk.GestureDrag()
    this._scroller.add_controller(pan)
    this._panGesture = pan
    return pan
  }

  /** Capture the scroll origin, unless the press landed on a card (then deny). */
  private _onPanBegin(gesture: Gtk.GestureDrag, x: number, y: number): void {
    const point = new Graphene.Point()
    point.init(x, y)
    const [ok, inSurface] = this._scroller.compute_point(this._surface, point)
    const picked = ok ? this._surface.pick(inSurface.x, inSurface.y, Gtk.PickFlags.DEFAULT) : null
    if (picked && picked !== (this._surface as Gtk.Widget)) {
      gesture.set_state(Gtk.EventSequenceState.DENIED)
      return
    }
    this._panStart = { h: this._scroller.hadjustment.value, v: this._scroller.vadjustment.value }
  }

  private _rebuildCards(): void {
    for (const [, card] of this._cards) this._surface.remove(card)
    this._cards.clear()
    this._previews.clear()

    for (const scene of this._scenes) {
      const card = new SceneCard()
      card.setScene(scene)
      this._injectPreviewIfAvailable(card, scene)
      card.connect('clicked', () => {
        if (card.isDragging) return
        this.selectedId = scene.id
        this.emit('scene-selected', scene.id)
      })
      card.connect('scene-activated', () => {
        this.emit('scene-opened', scene.id)
      })
      this._wireDrag(scene.id, card)
      this._cards.set(scene.id, card)
      this._surface.put(card, scene.x, scene.y)
    }
  }

  /**
   * For real projects (where the host passed us a `GameProjectResource`),
   * swap the card's default mini-map placeholder for a `MapPreview`
   * that paints the scene's actual tile data — a section of the map at
   * a uniform native-pixel zoom. The card's lock toggle switches its
   * drag between moving the card (locked, default) and panning the
   * section (unlocked; persisted via `preview-moved`). Falls through
   * to the default placeholder if the resource has no matching map.
   */
  private _injectPreviewIfAvailable(card: SceneCard, scene: SampleScene): void {
    if (!this._projectResource) return
    const mapData = this._projectResource.maps.get(scene.id)?.mapData
    if (!mapData) return

    const cols = scene.cols ?? 0
    const previewRows = scene.previewRows ?? 0
    if (!cols || !previewRows) return

    const preview = new MapPreview()
    preview.set_size_request(cols * scene.tilePx, previewRows * scene.tilePx)
    card.setPreviewWidget(preview)
    card.viewportLockable = true
    this._previews.set(scene.id, preview)
    void preview.setFromResource(this._projectResource, scene.id, {
      tileX: scene.previewTileX ?? mapData.columns / 2,
      tileY: scene.previewTileY ?? mapData.rows / 2,
      zoom: this._previewZoom,
    })
    card.connect('preview-pan-update', (_c: SceneCard, dx: number, dy: number) => {
      preview.panViewportBy(dx, dy)
    })
    card.connect('preview-pan-end', () => {
      const centre = preview.commitViewport()
      if (centre) this.emit('preview-moved', scene.id, centre.tileX, centre.tileY)
    })
    card.connect('lock-changed', (_c: SceneCard, unlocked: boolean) => {
      this.emit('preview-lock-changed', scene.id, unlocked)
    })
  }

  private _wireDrag(sceneId: string, card: SceneCard): void {
    let originX = 0
    let originY = 0
    card.connect('scene-drag-begin', () => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      originX = scene.x
      originY = scene.y
      this.selectedId = sceneId
      // Distinct from `scene-selected` (click): drag-begin still
      // selects the card so the inspector can refresh its content,
      // but the host MUST NOT auto-open the inspector here — on
      // smartphone widths the overlay drawer would cover the
      // canvas the moment the drag starts.
      this.emit('scene-drag-began', sceneId)
    })
    card.connect('scene-drag-update', (_c: SceneCard, dx: number, dy: number) => {
      this._surface.move(card, Math.max(0, originX + dx), Math.max(0, originY + dy))
      // Re-publish the world so the overlay redraws against the moved
      // cards mid-drag. Cheap enough to do on every motion event.
      this._teleports.setWorld(this._scenes, this._teleportData, 1)
    })
    card.connect('scene-drag-end', (_c: SceneCard, dx: number, dy: number) => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      // Snap the release position to the atlas grid so cards line up.
      scene.x = snapToGrid(originX + dx, ATLAS_GRID)
      scene.y = snapToGrid(originY + dy, ATLAS_GRID)
      this._surface.move(card, scene.x, scene.y)
      this._sizeSurface()
      this._teleports.setWorld(this._scenes, this._teleportData, 1)
      this.emit('scene-moved', sceneId, scene.x, scene.y)
      this.emit('world-changed')
    })
  }

  private _sizeSurface(): void {
    const { width, height } = surfaceSize(this._scenes, SURFACE_PADDING)
    this._contentW = width
    this._contentH = height
    this._surface.set_size_request(width, height)
    this._teleports.set_size_request(width, height)
  }
}

GObject.type_ensure(AtlasCanvas.$gtype)
