import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import { SignalScope } from '../../utils/signal-scope.ts'
import type { PeerMarker } from '../common/peer-dots.ts'
import {
  type SceneRect,
  sceneRects,
  isTap,
  scrollClearOfBottom,
  separateCardRects,
  snapToGrid,
  survivingSelection,
} from './atlas-canvas.geometry.ts'
import Template from './atlas-canvas.blp'
import {
  CARD_MIN_SHORT_SIDE,
  CARD_MIN_SHORT_SIDE_PHONE,
  centeredScroll,
  clampAtlasZoom,
  drawnRects,
  fitZoom,
  isCardFloored,
  surfacePadding,
  zoomAroundPointer,
} from './atlas-camera.ts'
import type { ConnectionHit, DoorRef } from './map-connections.model.ts'
import { buildConnectionMenu, type ConnectionMenuFacts, buildMapContextMenu } from './map-menu.ts'
import { MapPreview } from './map-preview'
import { SceneCard } from './scene-card'
import { TeleportOverlay } from './teleport-overlay'

GObject.type_ensure(SceneCard.$gtype)
GObject.type_ensure(TeleportOverlay.$gtype)
GObject.type_ensure(MapPreview.$gtype)

/**
 * Breathing room (surface px) kept around a world that is LARGER than
 * the viewport, so cards can still be dragged outwards past the current
 * extent. A smaller world gets whatever padding centres it instead —
 * see {@link surfacePadding}.
 */
const MIN_SURFACE_PADDING = 180

/**
 * Grid step (atlas-space px) that dragged scene cards snap to on
 * release — keeps the world tidy + aligned instead of pixel-fuzzy.
 */
const ATLAS_GRID = 8

/**
 * Breathing room (surface px) left between two cards the minimum card
 * size pushed into each other. Touching cards read as one card with a
 * seam, which is precisely what the separation is there to avoid.
 */
const CARD_SEPARATION_GAP = 8

/**
 * Margin {@link fit} leaves around the world. Generous on purpose: the
 * camera only knows the card BODIES, while a card also carries its
 * title above the body, so the real drawn world is taller than the rects
 * the fit math sees.
 */
const FIT_MARGIN = 56

/** Zoom factor applied per Ctrl+scroll notch (≈10 % per step). */
const ZOOM_WHEEL_FACTOR = 1.1

/** The camera state a host persists and restores per project. */
export interface AtlasCamera {
  zoom: number
  scrollX: number
  scrollY: number
}

/**
 * Typed view of the signals {@link AtlasCanvas} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface AtlasCanvasSignals extends Adw.Bin.SignalSignatures {
  'scene-selected': (sceneId: string) => void
  'scene-drag-began': (sceneId: string) => void
  'scene-deselected': () => void
  'scene-opened': (sceneId: string) => void
  'scene-moved': (sceneId: string, x: number, y: number) => void
  'door-retargeted': (mapId: string, placementId: string, targetMapId: string, tileX: number, tileY: number) => void
  'camera-changed': () => void
  'world-changed': () => void
}

/**
 * Zoomable, scrollable atlas surface — the "World" home view.
 *
 * Composition:
 * - `Gtk.ScrolledWindow` provides pan via native scroll / drag.
 * - `Gtk.Fixed` holds the scene cards at absolute SURFACE coords.
 *   `.atlas-surface` CSS paints the dotted backdrop.
 * - `Gtk.Overlay` lays a {@link TeleportOverlay} over the cards so the
 *   bezier teleport connections render on top.
 *
 * ## The camera
 *
 * Scene positions are stored in **atlas space**; the canvas draws them
 * at `zoom` widget px per atlas px (the OSD shows `zoom * 100 %`). There
 * is no `Gsk` child transform: each card is given an explicit pixel size
 * and its `MapPreview` paints the whole map scaled into it, so titles
 * stay crisp at a readable size and hit-testing needs no inverse
 * transform. The pure math lives in `atlas-camera.ts`; this class only
 * applies the numbers and reads the resulting card sizes back from GTK.
 *
 * Surface padding is dynamic: a world smaller than the viewport is
 * padded exactly enough to sit centred (so `fit` leaves no scroll range
 * to drift in), a larger one keeps {@link MIN_SURFACE_PADDING}.
 *
 * Selection: clicking a `SceneCard` updates the active id, emits
 * `scene-selected`, and dims unrelated teleports via the overlay.
 * Double-clicking (or pressing Enter on a focused card) emits
 * `scene-opened`, which the host handles to switch to the scene editor.
 *
 * Connections are drawn by the `TeleportOverlay` above the surface. It
 * takes no events of its own (`can_target = false`), so the canvas
 * feeds it what it cannot see — the pointer position, the visible
 * region, the zoom — and routes a press on one of its edge chips to
 * {@link focusScene}.
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
  private _startMapId: string | null = null
  /** Latest presence, re-applied to cards a rebuild just replaced. */
  private _peerMarkers: ReadonlyMap<string, readonly PeerMarker[]> = new Map()
  private _projectResource: GameProjectResource | null = null
  private _compact = false
  /** Widget px per atlas px. */
  private _zoom = 1
  /** Drawn card BODY rects in surface coords, by scene id. */
  private _drawn = new Map<string, SceneRect>()
  /** Whole card rects (title included) in surface coords, by scene id. */
  private _drawnCards = new Map<string, SceneRect>()
  /** Each card's body inset from its own top-left (the title overhang). */
  private _offsets = new Map<string, { x: number; y: number }>()
  private _surfaceW = 0
  private _surfaceH = 0
  /** Idle sources of deferred scroll writes — see `_queueScrollWrite`. */
  private _scrollIdles = new Set<number>()
  /** Guards `_relayout` against the allocation it triggers itself. */
  private _relayouting = false
  /**
   * Whether the current zoom came from {@link fit} and has not been
   * overridden since. A fitted camera follows the viewport: it re-fits
   * when the window resizes instead of keeping a zoom that was computed
   * for a different size.
   */
  private _fitted = false
  /** Viewport size the live {@link _fitted} zoom was computed for. */
  private _fitViewport = { w: 0, h: 0 }
  /** Guards `_applyFit` against a notify raised from inside its own pass. */
  private _fitting = false
  /** Backdrop-pan gesture on the scroller; created on first map, kept for life. */
  private _panGesture: Gtk.GestureDrag | null = null
  /** Pinch-to-zoom on the scroller; created on first map, kept for life. */
  private _zoomGesture: Gtk.GestureZoom | null = null
  /** Ctrl+scroll zoom on the scroller; created on first map, kept for life. */
  private _scrollController: Gtk.EventControllerScroll | null = null
  /** Pointer tracking on the surface, so a hovered line names itself. */
  private _motionController: Gtk.EventControllerMotion | null = null
  /**
   * Primary clicks on the surface, for the two things the overlay draws
   * into empty space: the edge chips of off-screen maps and the door
   * lines themselves.
   */
  private _chipGesture: Gtk.GestureClick | null = null
  /** Zoom captured when a pinch begins — the gesture reports a ratio. */
  private _pinchBase = 1
  /** Scroll offsets captured at pan start, so the drag delta is absolute. */
  private _panStart = { h: 0, v: 0 }
  /** Whether the current backdrop press began on empty surface (a tap candidate). */
  private _panOnBackdrop = false
  private _keyController: Gtk.EventControllerKey | null = null
  /**
   * The map context menu, shared by every card. A `Gtk.PopoverMenu` is
   * a `GtkNative`, so it takes no part in the overlay's layout and only
   * needs a parent to position against — one instance pointed at the
   * press position is enough. Parented lazily and taken off again in
   * `vfunc_unmap`, the same contract as `scene-editor.ts`'s placement
   * menu.
   */
  private _mapMenu: Gtk.PopoverMenu | null = null
  /**
   * The popover of a door line. A second instance rather than a second
   * model on {@link _mapMenu}: the two are pointed at different places
   * and the line's model is rebuilt per press, and swapping a model in
   * and out of one popover would make every press depend on which menu
   * was open last.
   */
  private _lineMenu: Gtk.PopoverMenu | null = null
  private _signals = new SignalScope()
  /**
   * Holds the single deferred camera operation waiting for the
   * scroller's first allocation. Separate from {@link _signals} so a
   * later `fit` / `restoreCamera` can supersede a pending one without
   * dropping the map-scoped gesture handlers.
   */
  private _pending = new SignalScope()
  /**
   * Holds the re-apply of a scroll offset that the adjustment clamped
   * because its `upper` had not caught up with the new surface size yet.
   */
  private _scrollPending = new SignalScope()

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
          compact: GObject.ParamSpec.boolean(
            'compact',
            'Compact',
            'Phone-width layout: scene cards keep a larger minimum size for touch',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          // Fires on a **click-only** selection (no drag), and on a
          // long press / secondary click before the context menu
          // opens. Hosts treat this as the "user picked this map"
          // intent. See `scene-drag-began` for the drag-start sibling.
          'scene-selected': { param_types: [GObject.TYPE_STRING] },
          // Fires on `scene-drag-begin`. Same `(sceneId,)` payload as
          // `scene-selected`, kept separate so a host can tell a
          // deliberate pick from the selection a drag makes on the
          // way past — a drag must not trigger anything that covers
          // the canvas mid-move.
          'scene-drag-began': { param_types: [GObject.TYPE_STRING] },
          // A tap on empty backdrop or Escape dropped the selection.
          'scene-deselected': { param_types: [] },
          'scene-opened': { param_types: [GObject.TYPE_STRING] },
          'scene-moved': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT, GObject.TYPE_INT],
          },
          // A door was dragged from its handle onto a tile of another
          // card: `(mapId, placementId, targetMapId, tileX, tileY)`.
          // The canvas only reports the gesture — the host owns the
          // write, because pointing a door somewhere is a Command on
          // the door's own map and needs that map open.
          'door-retargeted': {
            param_types: [
              GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GObject.TYPE_INT,
              GObject.TYPE_INT,
            ],
          },
          // The camera moved by an explicit operation (zoom, fit,
          // focus, restore) — the OSD pill re-reads the zoom level.
          // Plain scrolling does NOT emit this; the overview minimap
          // tracks the adjustments' own `value-changed` instead.
          'camera-changed': {},
          // Emitted whenever the surface geometry changes (world set,
          // card moved) so the overview minimap can re-read scene rects
          // + content size. No payload — consumers pull via getters.
          'world-changed': {},
        },
      },
      AtlasCanvas,
    )
  }

  declare connect: GObject.SignalMethods<this, AtlasCanvasSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, AtlasCanvasSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, AtlasCanvasSignals>['emit']

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
    const survivor = survivingSelection(
      this._selectedId ?? null,
      scenes.map((scene) => scene.id),
    )
    this._rebuildCards()
    // The rebuild hands out fresh cards, all of them unselected, so a
    // surviving selection has to be written through again — and one
    // whose scene the new world dropped has to go. Without this the
    // overlay kept the old scene's lines lit and the selection bar
    // named a map that had no card left.
    this._applySelection(survivor)
    this._relayout()
    this.emit('world-changed')
  }

  get selectedId(): string {
    return this._selectedId ?? ''
  }

  set selectedId(value: string) {
    const newId = value || null
    if (this._selectedId === newId) return
    this._applySelection(newId)
  }

  /**
   * Write a selection through to the cards and the connection overlay,
   * without the setter's dedupe: {@link setWorld} needs to re-apply an
   * UNCHANGED selection, because the card it belonged to no longer
   * exists after a rebuild.
   */
  private _applySelection(id: string | null): void {
    this._selectedId = id
    for (const [cardId, card] of this._cards) {
      card.selected = cardId === id
    }
    this._teleports.setSelected(id)
    this.notify('selected-id')
  }

  /** Phone-width layout — scene cards stay larger so they remain tappable. */
  get compact(): boolean {
    return this._compact ?? false
  }

  set compact(value: boolean) {
    if (this._compact === value) return
    this._compact = value
    this.notify('compact')
    this._relayout()
  }

  /** Current zoom: widget px per atlas px (`1` = 100 %). */
  get zoom(): number {
    return this._zoom
  }

  /**
   * Zoom the camera, keeping the surface point under `anchor`
   * (viewport-relative px) in place. Without an anchor the viewport
   * centre holds still.
   *
   * The anchor is approximate: cards floored to the minimum short side
   * do not scale with the zoom, and the dynamic surface padding shifts
   * with the drawn extent, so the point under the pointer can drift by a
   * few px. Invisible in practice, and the alternative — solving for the
   * padding before knowing the card sizes — is circular.
   */
  setZoom(zoom: number, anchor?: { x: number; y: number }): void {
    const clamped = clampAtlasZoom(zoom)
    if (clamped === this._zoom) return
    const h = this._scroller.hadjustment
    const v = this._scroller.vadjustment
    const point = anchor ?? { x: h.page_size / 2, y: v.page_size / 2 }
    const scrollX = zoomAroundPointer(h.value, point.x, this._zoom, clamped)
    const scrollY = zoomAroundPointer(v.value, point.y, this._zoom, clamped)
    this._zoom = clamped
    this._fitted = false
    this._relayout()
    this._applyScroll(scrollX, scrollY)
    this.emit('camera-changed')
  }

  /**
   * Zoom out until the whole world fits the viewport, then centre it.
   * Deferred until the scroller has a real page size, so the math never
   * runs against a zero viewport.
   *
   * The camera stays *fitted* afterwards (see {@link isFitted}) and
   * re-fits on every later viewport change, so the world still fits once
   * the surrounding chrome has taken its share of the allocation.
   */
  fit(): void {
    this._whenAllocated(() => this._applyFit())
  }

  /**
   * Whether the live camera is a fit rather than a zoom the user chose.
   * A host that persists the camera stores nothing while this is true:
   * the fit belongs to the window size it was computed for, and
   * re-fitting at the next size is better than restoring a stale one.
   */
  get isFitted(): boolean {
    return this._fitted
  }

  /** Zoom + scroll offsets, for a host that persists them per project. */
  get camera(): AtlasCamera {
    return {
      zoom: this._zoom,
      scrollX: this._scroller.hadjustment.value,
      scrollY: this._scroller.vadjustment.value,
    }
  }

  /** Re-apply a persisted {@link camera}, once the viewport has a size. */
  restoreCamera(camera: AtlasCamera): void {
    this._whenAllocated(() => {
      this._zoom = clampAtlasZoom(camera.zoom)
      this._fitted = false
      this._relayout()
      this._applyScroll(camera.scrollX, camera.scrollY)
      this.emit('camera-changed')
    })
  }

  /** Scroll one scene's card into the centre of the viewport. */
  focusScene(sceneId: string): void {
    this._whenAllocated(() => {
      const rect = this._drawn.get(sceneId)
      if (!rect) return
      const h = this._scroller.hadjustment
      const v = this._scroller.vadjustment
      this._applyScroll(
        centeredScroll(rect.x, rect.w, this._surfaceW, h.page_size),
        centeredScroll(rect.y, rect.h, this._surfaceH, v.page_size),
      )
      this.emit('camera-changed')
    })
  }

  /**
   * Scroll a map's card up until it clears a `reserve`-px band over the
   * bottom of the view — what the phone's floating selection pill needs
   * so it never sits on the card it names. Does nothing if it already
   * clears, and never scrolls horizontally.
   */
  revealAboveBottom(sceneId: string, reserve: number): void {
    this._whenAllocated(() => {
      const rect = this._drawnCards.get(sceneId) ?? this._drawn.get(sceneId)
      if (!rect) return
      const v = this._scroller.vadjustment
      const next = scrollClearOfBottom(v.value, rect.y, rect.h, v.page_size, v.upper, reserve)
      if (next === v.value) return
      this._applyScrollAxis(v, next)
      this.emit('camera-changed')
    })
  }

  /** Mark one map as the game's start map — it gets the start badge. */
  setStartMapId(sceneId: string | null): void {
    this._startMapId = sceneId || null
    for (const [id, card] of this._cards) card.startMap = id === this._startMapId
  }

  /**
   * Paint presence onto the cards: `bySceneId` maps a map's id to the
   * people editing it right now (REDESIGN.md § 4.7).
   *
   * A walk over the existing cards, like {@link setStartMapId} — never a
   * rebuild. Presence changes on every navigation anyone makes, and
   * rebuilding would drop the injected map previews and restart the
   * atlas layout mid-drag.
   */
  setPeerMarkers(bySceneId: ReadonlyMap<string, readonly PeerMarker[]>): void {
    this._peerMarkers = bySceneId
    for (const [id, card] of this._cards) card.setPeers(bySceneId.get(id) ?? [])
  }

  /** Total scrollable surface size (drawn world + dynamic padding). */
  get contentSize(): { width: number; height: number } {
    return { width: this._surfaceW, height: this._surfaceH }
  }

  /**
   * Drawn card body rects in surface coords, in scene order — feeds the
   * overview minimap, which shares the canvas's coordinate space.
   */
  sceneRects(): SceneRect[] {
    return this._scenes.map((scene) => this._drawn.get(scene.id) ?? { x: 0, y: 0, w: 0, h: 0 })
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
    this._signals.connect(pan, 'drag-end', (_g: Gtk.GestureDrag, dx: number, dy: number) => {
      if (this._panOnBackdrop && isTap(dx, dy)) this._deselect()
      this._panOnBackdrop = false
    })

    const keys = this._ensureKeyController()
    this._signals.connect(keys, 'key-pressed', (_c: Gtk.EventControllerKey, keyval: number) => {
      if (keyval !== Gdk.KEY_Escape || !this._selectedId) return false
      this._deselect()
      return true
    })

    const pinch = this._ensureZoomGesture()
    this._signals.connect(pinch, 'begin', () => {
      this._pinchBase = this._zoom
    })
    this._signals.connect(pinch, 'scale-changed', (gesture: Gtk.GestureZoom, scale: number) => {
      this.setZoom(this._pinchBase * scale, this._pinchAnchor(gesture))
    })

    const scroll = this._ensureScrollController()
    this._signals.connect(scroll, 'scroll', (controller: Gtk.EventControllerScroll, _dx: number, dy: number) =>
      this._onScroll(controller, dy),
    )

    const motion = this._ensureMotionController()
    this._signals.connect(motion, 'motion', (_c: Gtk.EventControllerMotion, x: number, y: number) =>
      this._teleports.setHoverPoint({ x, y }),
    )
    this._signals.connect(motion, 'leave', () => this._teleports.setHoverPoint(null))

    const chips = this._ensureChipGesture()
    this._signals.connect(chips, 'pressed', (gesture: Gtk.GestureClick, _n: number, x: number, y: number) =>
      this._onSurfacePressed(gesture, x, y),
    )

    // The overlay's edge chips and its dimming are answered against the
    // visible region, which scrolling moves without any layout pass
    // running — so the viewport is pushed from the adjustments too, not
    // only from `_layoutPass`.
    this._signals.connect(this._scroller.hadjustment, 'value-changed', () => this._pushViewport())
    this._signals.connect(this._scroller.vadjustment, 'value-changed', () => this._pushViewport())
    this._pushViewport()

    // The surface padding centres a small world in the CURRENT viewport,
    // and a fitted camera is only valid for the size it was fitted to —
    // so a resized viewport has to re-run both.
    this._signals.connect(this._scroller.hadjustment, 'notify::page-size', () => this._onViewportResized())
    this._signals.connect(this._scroller.vadjustment, 'notify::page-size', () => this._onViewportResized())
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    this._pending.disconnectAll()
    this._scrollPending.disconnectAll()
    this._cancelScrollWrites()
    // A `set_parent`ed popover is a real child of the overlay and has
    // to be taken off by hand, or the overlay is finalized with
    // children still attached. `_ensureMapMenu` re-parents it on the
    // next press.
    if (this._mapMenu?.get_parent()) {
      this._mapMenu.popdown()
      this._mapMenu.unparent()
      this._mapMenu = null
    }
    if (this._lineMenu?.get_parent()) {
      this._lineMenu.popdown()
      this._lineMenu.unparent()
      this._lineMenu = null
    }
    super.vfunc_unmap()
  }

  /** Card-size floor for the current form factor. */
  private get _minShortSide(): number {
    return this._compact ? CARD_MIN_SHORT_SIDE_PHONE : CARD_MIN_SHORT_SIDE
  }

  /**
   * Run `fn` once the scroller has a real page size — now if it already
   * has one, otherwise on its first allocation. At most one deferred
   * camera operation is ever pending: a second call before the first
   * allocation supersedes the first instead of stacking another handler
   * on the adjustment, and `vfunc_unmap` releases one that never got its
   * allocation.
   */
  private _whenAllocated(fn: () => void): void {
    const h = this._scroller.hadjustment
    this._pending.disconnectAll()
    if (h.page_size > 0) {
      fn()
      return
    }
    this._pending.connectUntil(h, 'notify::page-size', () => {
      if (h.page_size <= 0) return false
      fn()
      return true
    })
  }

  /**
   * Zoom to fit and centre, against the viewport as it is right now.
   *
   * Reentrancy-guarded: the pass re-sizes the surface, which allocates,
   * which can notify `page-size` straight back into
   * {@link _onViewportResized}.
   */
  private _applyFit(): void {
    if (this._fitting) return
    this._fitting = true
    try {
      const h = this._scroller.hadjustment
      const v = this._scroller.vadjustment
      this._fitViewport = { w: h.page_size, h: v.page_size }
      this._zoom = fitZoom({ w: h.page_size, h: v.page_size }, sceneRects(this._scenes), FIT_MARGIN, this._minShortSide)
      this._fitted = true
      this._relayout()
      this._applyScroll((this._surfaceW - h.page_size) / 2, (this._surfaceH - v.page_size) / 2)
    } finally {
      this._fitting = false
    }
    this.emit('camera-changed')
  }

  /**
   * React to the scroller's viewport changing size.
   *
   * A fitted camera re-fits: `fit()` runs as soon as the scroller has
   * *any* page size, which on startup is the window's full height —
   * before the 48 px header bar has been subtracted. Without this the
   * world opened a few percent too large and the bottom row of cards sat
   * clipped off the viewport forever. Any other camera only needs the
   * layout pass, because the surface padding centres a small world in
   * the viewport as it is now.
   */
  private _onViewportResized(): void {
    const h = this._scroller.hadjustment
    const v = this._scroller.vadjustment
    const changed = h.page_size !== this._fitViewport.w || v.page_size !== this._fitViewport.h
    if (this._fitted && changed && h.page_size > 0 && v.page_size > 0) {
      this._applyFit()
      return
    }
    this._relayout()
  }

  /**
   * Write both scroll offsets, re-applying each once the adjustment's
   * `upper` catches up. `set_size_request` on the surface only reaches
   * the adjustments on the next allocation, so a value aimed at the
   * freshly grown surface would otherwise be clamped to the old range
   * and the camera would land short.
   */
  private _applyScroll(x: number, y: number): void {
    this._scrollPending.disconnectAll()
    this._cancelScrollWrites()
    this._applyScrollAxis(this._scroller.hadjustment, x)
    this._applyScrollAxis(this._scroller.vadjustment, y)
  }

  private _applyScrollAxis(adjustment: Gtk.Adjustment, target: number): void {
    const want = Math.max(0, target)
    adjustment.value = want
    // Landed where we aimed — the adjustment's range already covers it.
    if (adjustment.value >= want - 0.5) return
    this._scrollPending.connectUntil(adjustment, 'notify::upper', () => {
      this._queueScrollWrite(adjustment, want)
      return true
    })
  }

  /**
   * Write a scroll offset from an idle instead of straight away.
   *
   * `Gtk.Viewport` emits `notify::upper` from inside its own
   * `size_allocate`, and the re-allocation an adjustment write asks for
   * there is dropped: the adjustment ends up holding the new offset
   * while the viewport keeps drawing the child at the old one, with
   * nothing left to correct it. That is what left a fitted world
   * clipped — only on the viewport sizes where the first write got
   * clamped and the deferred re-apply was needed at all, which is why
   * it looked like a desktop-only bug.
   */
  private _queueScrollWrite(adjustment: Gtk.Adjustment, want: number): void {
    let id = 0
    id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._scrollIdles.delete(id)
      adjustment.value = Math.max(0, Math.min(want, adjustment.upper - adjustment.page_size))
      return GLib.SOURCE_REMOVE
    })
    this._scrollIdles.add(id)
  }

  /** Drop scroll writes that never got their idle (re-fit, unmap). */
  private _cancelScrollWrites(): void {
    for (const id of this._scrollIdles) GLib.source_remove(id)
    this._scrollIdles.clear()
  }

  /**
   * Drag on the empty atlas backdrop pans the scrolled view (a drag on
   * a card moves the card instead, via the card's own gesture). The
   * gesture lives on the SCROLLER — its coordinates are viewport-stable,
   * so adjusting the scroll position doesn't shift the gesture's own
   * reference frame (the same feedback loop the cards' parent-space drag
   * math guards against). Created once and kept; `vfunc_unmap` releases
   * its handlers, not the controller.
   */
  private _ensurePanGesture(): Gtk.GestureDrag {
    if (this._panGesture) return this._panGesture
    const pan = new Gtk.GestureDrag()
    this._scroller.add_controller(pan)
    this._panGesture = pan
    return pan
  }

  private _ensureKeyController(): Gtk.EventControllerKey {
    if (this._keyController) return this._keyController
    const keys = new Gtk.EventControllerKey()
    this.add_controller(keys)
    this._keyController = keys
    return keys
  }

  /** Drop the selection; a no-op when nothing is selected. */
  private _deselect(): void {
    if (!this._selectedId) return
    this._applySelection(null)
    this.emit('scene-deselected')
  }

  /** Pinch-to-zoom, also on the scroller so its centre is viewport-relative. */
  private _ensureZoomGesture(): Gtk.GestureZoom {
    if (this._zoomGesture) return this._zoomGesture
    const pinch = new Gtk.GestureZoom()
    this._scroller.add_controller(pinch)
    this._zoomGesture = pinch
    return pinch
  }

  /**
   * Ctrl+scroll zoom. Runs in the CAPTURE phase so it sees the event
   * before the `ScrolledWindow` turns it into a scroll, and claims only
   * the modified ones — plain scrolling still pans.
   */
  private _ensureScrollController(): Gtk.EventControllerScroll {
    if (this._scrollController) return this._scrollController
    const scroll = Gtk.EventControllerScroll.new(Gtk.EventControllerScrollFlags.VERTICAL)
    scroll.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    this._scroller.add_controller(scroll)
    this._scrollController = scroll
    return scroll
  }

  /**
   * Pointer tracking for the overlay's hover state. It sits on the
   * `Gtk.Fixed`, not on the overlay: the overlay is `can_target = false`
   * so it never sees an event, while the surface is the deepest
   * targetable widget here and a bubble-phase controller on it also
   * reports the motion that passed over a card — in exactly the surface
   * coords the overlay draws in.
   */
  private _ensureMotionController(): Gtk.EventControllerMotion {
    if (this._motionController) return this._motionController
    const motion = new Gtk.EventControllerMotion()
    this._surface.add_controller(motion)
    this._motionController = motion
    return motion
  }

  /**
   * Primary presses on the surface, for the edge chips the overlay draws
   * where a line leaves the viewport. Also on the surface, for the same
   * reason as {@link _ensureMotionController}.
   */
  private _ensureChipGesture(): Gtk.GestureClick {
    if (this._chipGesture) return this._chipGesture
    const click = new Gtk.GestureClick({ button: Gdk.BUTTON_PRIMARY })
    this._surface.add_controller(click)
    this._chipGesture = click
    return click
  }

  /**
   * A primary press on the surface, answered against what the overlay
   * drew there. A chip first, then a line: a chip sits ON a line's far
   * end, so testing the line first would make every chip unreachable.
   *
   * A chip names the map a line leads to off-screen; pressing it scrolls
   * that map into view and nothing else. Deliberately not a selection:
   * the chip is a way to follow a connection, and a user who was
   * comparing it against the map they had picked would lose that pick.
   *
   * Between the two, a press that landed on a CARD is handed back: a
   * line ends on the door's own tile, so a plain click on a card near
   * one of its doors is within the line's hit radius, and testing the
   * line here would open a popover where the user asked to pick the
   * map. The chips are tested before that check because they are drawn
   * at the viewport edge, over whatever card happens to be there.
   *
   * Claims the sequence only on a hit, so an ordinary press on empty
   * surface still reaches the backdrop pan.
   */
  private _onSurfacePressed(gesture: Gtk.GestureClick, x: number, y: number): void {
    const mapId = this._teleports.chipAt({ x, y })
    if (mapId) {
      gesture.set_state(Gtk.EventSequenceState.CLAIMED)
      this.focusScene(mapId)
      return
    }
    if (this._surface.pick(x, y, Gtk.PickFlags.DEFAULT) !== this._surface) return
    const hit = this._teleports.connectionAt({ x, y })
    if (!hit) return
    gesture.set_state(Gtk.EventSequenceState.CLAIMED)
    this._popupLineMenu(hit, x, y)
  }

  /**
   * Open a line's popover (REDESIGN.md § 6.2) at the press position.
   *
   * The model is built fresh per press — `Gtk.PopoverMenu` takes
   * ownership of it — and carries the doors in its action targets, so
   * the canvas needs no "selected connection" state and the host needs
   * no new signal: the items are plain window actions.
   */
  private _popupLineMenu(hit: ConnectionHit, x: number, y: number): void {
    const facts = this._connectionMenuFacts(hit)
    if (!facts) return
    const menu = this._ensureLineMenu()
    menu.set_menu_model(buildConnectionMenu(facts))
    const point = new Graphene.Point()
    point.init(x, y)
    const [ok, inOverlay] = this._surface.compute_point(this._overlay, point)
    if (!ok) return
    menu.set_pointing_to(
      new Gdk.Rectangle({ x: Math.round(inOverlay.x), y: Math.round(inOverlay.y), width: 1, height: 1 }),
    )
    menu.popup()
  }

  private _ensureLineMenu(): Gtk.PopoverMenu {
    if (this._lineMenu) return this._lineMenu
    const menu = new Gtk.PopoverMenu({ hasArrow: false })
    menu.set_parent(this._overlay)
    this._lineMenu = menu
    return menu
  }

  /**
   * Name the doors behind a hit for the menu.
   *
   * The tiles come from the connection's own ends, which the model
   * documents as the door's tile for `from` and — for a pair — the
   * partner door's tile for `to`; `pairDoors` emits a pair at the lower
   * door index, so `doors[0]` is always the `from` end. They are only
   * ever shown, never acted on: the placement id is the identity.
   */
  private _connectionMenuFacts(hit: ConnectionHit): ConnectionMenuFacts | null {
    const { connection, doors } = hit
    if (!doors.length) return null
    const ends = [connection.from, connection.to]
    return {
      kind: connection.kind,
      doors: doors.map((door, index) => ({
        mapId: door.mapId,
        mapName: this._sceneName(door.mapId),
        placementId: door.placementId,
        tileX: ends[index]?.tileX ?? 0,
        tileY: ends[index]?.tileY ?? 0,
        shared: door.shared,
      })),
      farMapName: connection.kind === 'one-way' && connection.to ? this._sceneName(connection.to.mapId) : null,
    }
  }

  /** A map's display name, falling back to its id for a map we don't hold. */
  private _sceneName(id: string): string {
    return this._scenes.find((scene) => scene.id === id)?.name ?? id
  }

  /** Hand the overlay the visible region, in the coords it draws in. */
  private _pushViewport(): void {
    this._teleports.setViewport(this.viewportRect())
  }

  private _onScroll(controller: Gtk.EventControllerScroll, dy: number): boolean {
    const state = controller.get_current_event_state()
    if (!(state & Gdk.ModifierType.CONTROL_MASK)) return false
    this.setZoom(this._zoom * ZOOM_WHEEL_FACTOR ** -dy, this._pointerAnchor(controller))
    return true
  }

  /** The pinch centre, already in the scroller's (viewport) coordinates. */
  private _pinchAnchor(gesture: Gtk.GestureZoom): { x: number; y: number } | undefined {
    const [ok, x, y] = gesture.get_bounding_box_center()
    return ok ? { x, y } : undefined
  }

  /**
   * The pointer position of the controller's current event, in the
   * scroller's coordinates. Event positions are surface-relative, so the
   * native's own surface transform comes off first. Returns `undefined`
   * when the event carries no position — the caller then zooms around
   * the viewport centre.
   */
  private _pointerAnchor(controller: Gtk.EventController): { x: number; y: number } | undefined {
    const event = controller.get_current_event()
    const native = this.get_native()
    if (!event || !native) return undefined
    const [hasPosition, surfaceX, surfaceY] = event.get_position()
    if (!hasPosition) return undefined
    const [offsetX, offsetY] = native.get_surface_transform()
    const point = new Graphene.Point()
    point.init(surfaceX - offsetX, surfaceY - offsetY)
    const [ok, local] = (native as unknown as Gtk.Widget).compute_point(this._scroller, point)
    return ok ? { x: local.x, y: local.y } : undefined
  }

  /** Capture the scroll origin, unless the press landed on a card (then deny). */
  private _onPanBegin(gesture: Gtk.GestureDrag, x: number, y: number): void {
    const point = new Graphene.Point()
    point.init(x, y)
    const [ok, inSurface] = this._scroller.compute_point(this._surface, point)
    const picked = ok ? this._surface.pick(inSurface.x, inSurface.y, Gtk.PickFlags.DEFAULT) : null
    // A press on a card belongs to that card's own gestures, and one on
    // an edge chip or a door line to `_onSurfacePressed`. Both are
    // drawn by a `can_target = false` overlay, so `pick` cannot see
    // them and they are tested by hand — claim order between two
    // gestures on different widgets is not worth relying on for a pan
    // that would swallow the press.
    const overlayPoint = { x: inSurface.x, y: inSurface.y }
    const onOverlay =
      ok && (this._teleports.chipAt(overlayPoint) !== null || this._teleports.connectionAt(overlayPoint) !== null)
    if (onOverlay || (picked && picked !== (this._surface as Gtk.Widget))) {
      gesture.set_state(Gtk.EventSequenceState.DENIED)
      this._panOnBackdrop = false
      return
    }
    this._panOnBackdrop = true
    this._panStart = { h: this._scroller.hadjustment.value, v: this._scroller.vadjustment.value }
  }

  private _rebuildCards(): void {
    for (const [, card] of this._cards) this._surface.remove(card)
    this._cards.clear()
    this._drawn.clear()
    this._offsets.clear()

    for (const scene of this._scenes) {
      const card = new SceneCard()
      card.setScene(scene)
      card.startMap = scene.id === this._startMapId
      card.setPeers(this._peerMarkers.get(scene.id) ?? [])
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
      this._wireContextMenu(scene.id, card)
      this._cards.set(scene.id, card)
      // Placed for real by the next layout pass.
      this._surface.put(card, 0, 0)
    }
  }

  /**
   * For real projects (where the host passed us a `GameProjectResource`),
   * swap the card's default mini-map placeholder for a `MapPreview` that
   * paints the scene's actual tile data. The preview runs in FIT mode —
   * it scales the WHOLE map into whatever size the camera gave the card
   * — so it needs no size request and no pan wiring of its own. Falls
   * through to the default placeholder if the resource has no matching
   * map.
   */
  private _injectPreviewIfAvailable(card: SceneCard, scene: SampleScene): void {
    if (!this._projectResource?.maps.get(scene.id)) return
    const preview = new MapPreview()
    card.setPreviewWidget(preview)
    void preview.setFromResource(this._projectResource, scene.id)
  }

  /**
   * Long press (touch) and secondary click (pointer) on a card open the
   * map context menu. Both select the card FIRST: every item in the
   * menu is a stateless window action that reads the host's current
   * selection, so the menu must never open against a different map than
   * the one that was pressed.
   *
   * The controllers live on the card and die with it on the next
   * `_rebuildCards`; only the popover is shared.
   */
  private _wireContextMenu(sceneId: string, card: SceneCard): void {
    const open = (x: number, y: number): void => {
      this.selectedId = sceneId
      this.emit('scene-selected', sceneId)
      this._popupMapMenu(card, x, y)
    }

    const longPress = new Gtk.GestureLongPress()
    longPress.connect('pressed', (_g: Gtk.GestureLongPress, x: number, y: number) => open(x, y))
    card.add_controller(longPress)

    const secondary = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
    secondary.connect('pressed', (_g: Gtk.GestureClick, _n: number, x: number, y: number) => open(x, y))
    card.add_controller(secondary)
  }

  /** Point the shared menu at a position in CARD coords and open it. */
  private _popupMapMenu(card: SceneCard, x: number, y: number): void {
    const menu = this._ensureMapMenu()
    const point = new Graphene.Point()
    point.init(x, y)
    const [ok, inOverlay] = card.compute_point(this._overlay, point)
    if (!ok) return
    menu.set_pointing_to(
      new Gdk.Rectangle({ x: Math.round(inOverlay.x), y: Math.round(inOverlay.y), width: 1, height: 1 }),
    )
    menu.popup()
  }

  private _ensureMapMenu(): Gtk.PopoverMenu {
    if (this._mapMenu) return this._mapMenu
    const menu = new Gtk.PopoverMenu({ hasArrow: false, menuModel: buildMapContextMenu() })
    menu.set_parent(this._overlay)
    this._mapMenu = menu
    return menu
  }

  private _wireDrag(sceneId: string, card: SceneCard): void {
    // Captured at drag-begin: the scene's atlas position, plus the
    // card's and body's surface positions. Drag deltas arrive in
    // surface px, so the move is done in surface space and only the
    // release is converted back to atlas space.
    let atlasOrigin = { x: 0, y: 0 }
    let bodyOrigin = { x: 0, y: 0 }
    let cardOrigin = { x: 0, y: 0 }
    // Set for the whole drag when the press landed on a door's drag
    // handle: the same gesture then aims that door instead of moving
    // the card. One stream, two meanings, decided once at begin —
    // a second gesture competing for the press would make which one
    // wins depend on controller order.
    let connect: { door: DoorRef; from: { x: number; y: number }; press: { x: number; y: number } } | null = null
    card.connect('scene-drag-begin', () => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      const rect = this._drawn.get(sceneId)
      if (!scene || !rect) return

      const press = card.pressInParent
      const handle = press ? this._teleports.handleAt(press) : null
      if (press && handle) {
        connect = { door: handle.door, from: handle.point, press }
        this._teleports.setConnectDrag({ from: handle.point, to: press })
        return
      }
      connect = null

      const offset = this._offsets.get(sceneId) ?? { x: 0, y: 0 }
      atlasOrigin = { x: scene.x, y: scene.y }
      bodyOrigin = { x: rect.x, y: rect.y }
      cardOrigin = { x: rect.x - offset.x, y: rect.y - offset.y }
      this.selectedId = sceneId
      // Distinct from `scene-selected` (click): drag-begin still
      // selects the card so the inspector can refresh its content,
      // but the host MUST NOT auto-open the inspector here — on
      // smartphone widths the overlay drawer would cover the
      // canvas the moment the drag starts.
      this.emit('scene-drag-began', sceneId)
    })
    card.connect('scene-drag-update', (_c: SceneCard, dx: number, dy: number) => {
      if (connect) {
        this._teleports.setConnectDrag({
          from: connect.from,
          to: { x: connect.press.x + dx, y: connect.press.y + dy },
        })
        return
      }
      const rect = this._drawn.get(sceneId)
      if (!rect) return
      this._surface.move(card, cardOrigin.x + dx, cardOrigin.y + dy)
      // Patch the drawn rects so the teleport overlay follows the card
      // mid-drag. Cheap enough to do on every motion event.
      rect.x = bodyOrigin.x + dx
      rect.y = bodyOrigin.y + dy
      const cardRect = this._drawnCards.get(sceneId)
      if (cardRect) {
        cardRect.x = cardOrigin.x + dx
        cardRect.y = cardOrigin.y + dy
      }
      this._teleports.setWorld(this._scenes, this._teleportData, this._drawn, this._drawnCards)
    })
    card.connect('scene-drag-end', (_c: SceneCard, dx: number, dy: number) => {
      if (connect) {
        const { door, press } = connect
        connect = null
        this._teleports.setConnectDrag(null)
        // A drop on the backdrop is a cancel, not a clear: letting go
        // over nothing is how a user abandons a drag they started by
        // accident, and silently unlinking the door would be the one
        // outcome they cannot undo from the atlas.
        const target = this._teleports.dropTargetAt({ x: press.x + dx, y: press.y + dy })
        if (!target) return
        this.emit('door-retargeted', door.mapId, door.placementId, target.mapId, target.tile.x, target.tile.y)
        return
      }
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      // Snap the release position to the atlas grid so cards line up.
      scene.x = snapToGrid(atlasOrigin.x + dx / this._zoom, ATLAS_GRID)
      scene.y = snapToGrid(atlasOrigin.y + dy / this._zoom, ATLAS_GRID)
      this._relayout()
      this.emit('scene-moved', sceneId, scene.x, scene.y)
      this.emit('world-changed')
    })
  }

  /**
   * Re-place every card for the current zoom and viewport size. Guarded:
   * the pass changes the surface's size request, which allocates, which
   * can notify `page-size` straight back into here.
   */
  private _relayout(): void {
    if (this._relayouting) return
    this._relayouting = true
    try {
      this._layoutPass()
    } finally {
      this._relayouting = false
    }
  }

  /**
   * One layout pass, in five steps:
   * 1. scale the world rects to body rects at the current zoom,
   * 2. hand each body size to its card and measure the FULL card back
   *    (the title can be wider than the body and always sits above it,
   *    so a card's top-left is its body's minus the title overhang),
   * 3. push apart the cards the minimum card size enlarged into each
   *    other,
   * 4. derive the surface padding from the union of those card rects
   *    and the viewport size,
   * 5. place the cards and publish the drawn body rects.
   */
  private _layoutPass(): void {
    const worldRects = sceneRects(this._scenes)
    const bodies = drawnRects(worldRects, this._zoom, this._minShortSide)
    const placements: Array<{
      id: string
      card: SceneCard
      body: SceneRect
      rect: SceneRect
      floored: boolean
    }> = []

    this._scenes.forEach((scene, index) => {
      const card = this._cards.get(scene.id)
      const body = bodies[index]
      const world = worldRects[index]
      if (!card || !body || !world || !(body.w > 0) || !(body.h > 0)) return
      card.setBodySize(body.w, body.h)
      const offset = { x: card.bodyOffsetX, y: card.bodyOffsetY }
      this._offsets.set(scene.id, offset)
      placements.push({
        id: scene.id,
        card,
        body,
        rect: {
          x: body.x - offset.x,
          y: body.y - offset.y,
          w: card.cardWidth,
          h: card.cardHeight,
        },
        floored: isCardFloored(world, this._zoom, this._minShortSide),
      })
    })

    // Two small rooms a few atlas px apart both stop shrinking at the
    // minimum card size and end up drawn on top of each other — at Fit
    // on phone widths the cozy tree house's title landed inside the
    // card above it. Only the enlarged cards give way; the shift moves
    // body and card rect together so every endpoint stays on its card.
    separateCardRects(
      placements.map((placement) => placement.rect),
      placements.map((placement) => placement.floored),
      CARD_SEPARATION_GAP,
    ).forEach((shift, index) => {
      const placement = placements[index]
      if (!placement || (shift.dx === 0 && shift.dy === 0)) return
      placement.rect = { ...placement.rect, x: placement.rect.x + shift.dx, y: placement.rect.y + shift.dy }
      placement.body = { ...placement.body, x: placement.body.x + shift.dx, y: placement.body.y + shift.dy }
    })

    let minX = 0
    let minY = 0
    let maxX = 0
    let maxY = 0
    for (const { rect } of placements) {
      minX = Math.min(minX, rect.x)
      minY = Math.min(minY, rect.y)
      maxX = Math.max(maxX, rect.x + rect.w)
      maxY = Math.max(maxY, rect.y + rect.h)
    }

    const h = this._scroller.hadjustment
    const v = this._scroller.vadjustment
    const padX = surfacePadding(maxX - minX, h.page_size, MIN_SURFACE_PADDING)
    const padY = surfacePadding(maxY - minY, v.page_size, MIN_SURFACE_PADDING)
    const origin = { x: padX - minX, y: padY - minY }

    this._drawn.clear()
    this._drawnCards.clear()
    for (const { id, card, body, rect } of placements) {
      this._surface.move(card, origin.x + rect.x, origin.y + rect.y)
      this._drawn.set(id, { x: origin.x + body.x, y: origin.y + body.y, w: body.w, h: body.h })
      this._drawnCards.set(id, { x: origin.x + rect.x, y: origin.y + rect.y, w: rect.w, h: rect.h })
    }

    this._surfaceW = maxX - minX + padX * 2
    this._surfaceH = maxY - minY + padY * 2
    this._surface.set_size_request(this._surfaceW, this._surfaceH)
    this._teleports.set_size_request(this._surfaceW, this._surfaceH)
    this._teleports.setZoom(this._zoom)
    this._teleports.setWorld(this._scenes, this._teleportData, this._drawn, this._drawnCards)
    this._pushViewport()
  }
}

GObject.type_ensure(AtlasCanvas.$gtype)
