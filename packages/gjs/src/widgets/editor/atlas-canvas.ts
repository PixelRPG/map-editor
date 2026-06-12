import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import Template from './atlas-canvas.blp'
import { MapPreview } from './map-preview'
import { SceneCard } from './scene-card'
import { TeleportOverlay } from './teleport-overlay'

GObject.type_ensure(SceneCard.$gtype)
GObject.type_ensure(TeleportOverlay.$gtype)
GObject.type_ensure(MapPreview.$gtype)

const SURFACE_PADDING = 180

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
  declare _scroller: Gtk.ScrolledWindow
  declare _overlay: Gtk.Overlay
  declare _surface: Gtk.Fixed
  declare _teleports: TeleportOverlay

  private _scenes: SampleScene[] = []
  private _teleportData: SampleTeleport[] = []
  private _cards: Map<string, SceneCard> = new Map()
  private _selectedId: string | null = null
  private _projectResource: GameProjectResource | null = null

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
  }

  constructor() {
    super()
    this._wireBackgroundPan()
  }

  /**
   * Drag on the empty atlas backdrop pans the scrolled view (cards keep
   * their own gestures: content drag pans the preview, the corner
   * handle moves the card). The gesture lives on the SCROLLER — its
   * coordinates are viewport-stable, so adjusting the scroll position
   * doesn't shift the gesture's own reference frame (the same feedback
   * loop the cards' parent-space drag math guards against). It denies
   * itself when the press landed on a card, so it can't fight them.
   */
  private _wireBackgroundPan(): void {
    const pan = new Gtk.GestureDrag()
    let startH = 0
    let startV = 0
    pan.connect('drag-begin', (gesture: Gtk.GestureDrag, x: number, y: number) => {
      const point = new Graphene.Point()
      point.init(x, y)
      const [ok, inSurface] = this._scroller.compute_point(this._surface, point)
      const picked = ok ? this._surface.pick(inSurface.x, inSurface.y, Gtk.PickFlags.DEFAULT) : null
      if (picked && picked !== (this._surface as Gtk.Widget)) {
        gesture.set_state(Gtk.EventSequenceState.DENIED)
        return
      }
      startH = this._scroller.hadjustment.value
      startV = this._scroller.vadjustment.value
    })
    pan.connect('drag-update', (_g: Gtk.GestureDrag, dx: number, dy: number) => {
      this._scroller.hadjustment.value = startH - dx
      this._scroller.vadjustment.value = startV - dy
    })
    this._scroller.add_controller(pan)
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

  /** Default native-pixel zoom of card previews (200%). */
  static readonly DEFAULT_PREVIEW_ZOOM = 2

  /** Current global preview zoom — the atlas zoom control drives it. */
  private _previewZoom = AtlasCanvas.DEFAULT_PREVIEW_ZOOM

  /** Live `MapPreview`s by scene id, for global zoom changes. */
  private _previews: Map<string, MapPreview> = new Map()

  get previewZoom(): number {
    return this._previewZoom
  }

  /**
   * Apply a new global preview zoom to every card (and to cards built
   * later). Clamped to a sane pixel-zoom range.
   */
  setPreviewZoom(zoom: number): void {
    const clamped = Math.min(6, Math.max(0.5, zoom))
    if (clamped === this._previewZoom) return
    this._previewZoom = clamped
    for (const preview of this._previews.values()) preview.setViewportZoom(clamped)
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
      const x = Math.max(0, originX + dx)
      const y = Math.max(0, originY + dy)
      this._surface.move(card, x, y)
      this._refreshTeleportSelection()
    })
    card.connect('scene-drag-end', (_c: SceneCard, dx: number, dy: number) => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      const nextX = Math.max(0, Math.round(originX + dx))
      const nextY = Math.max(0, Math.round(originY + dy))
      scene.x = nextX
      scene.y = nextY
      this._surface.move(card, nextX, nextY)
      this._sizeSurface()
      this._teleports.setWorld(this._scenes, this._teleportData, 1)
      this.emit('scene-moved', sceneId, nextX, nextY)
    })
  }

  private _refreshTeleportSelection(): void {
    // Re-publish the world so the overlay redraws against the moved cards
    // mid-drag. Cheap enough to do on every motion event.
    this._teleports.setWorld(this._scenes, this._teleportData, 1)
  }

  private _sizeSurface(): void {
    let maxX = 0
    let maxY = 0
    for (const s of this._scenes) {
      // Real-project scenes carry no terrain rows — fall back to the
      // cols/previewRows card geometry so the surface still spans them.
      const cols = s.rows[0]?.length || s.cols || 0
      const rows = s.rows.length || s.previewRows || 0
      const w = cols * s.tilePx
      const h = rows * s.tilePx
      maxX = Math.max(maxX, s.x + w)
      maxY = Math.max(maxY, s.y + h)
    }
    const targetW = maxX + SURFACE_PADDING * 2
    const targetH = maxY + SURFACE_PADDING * 2
    this._surface.set_size_request(targetW, targetH)
    this._teleports.set_size_request(targetW, targetH)
  }
}

GObject.type_ensure(AtlasCanvas.$gtype)
