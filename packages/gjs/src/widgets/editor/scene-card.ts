import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { SampleScene } from '../../__demo__/world-sample'
import { SignalScope } from '../../utils/signal-scope.ts'
import { MiniMap } from './mini-map'
import { hasPassedDragThreshold, isDoubleClick } from './scene-card.drag.ts'

import Template from './scene-card.blp'

GObject.type_ensure(MiniMap.$gtype)

/**
 * Typed view of the signals {@link SceneCard} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface SceneCardSignals extends Gtk.Button.SignalSignatures {
  'scene-activated': () => void
  'scene-drag-begin': () => void
  'scene-drag-update': (dx: number, dy: number) => void
  'scene-drag-end': (dx: number, dy: number) => void
}

/** Gap between the title row and the map body — mirrors `scene-card.blp`. */
const TITLE_SPACING_PX = 4

/** Largest tile size a sample-world mini-map is allowed to draw. */
const MINI_MAP_TILE_PX_MAX = 64

/**
 * Single atlas-space card representing one map.
 *
 * The card is a `Gtk.Button` styled `flat` so it picks up Adwaita's
 * focus/hover/press states for free. The host application positions the
 * card via `Gtk.Fixed.put(card, x, y)` and toggles the `selected`
 * style class on selection — that drives the accent ring.
 *
 * Layout: a free-floating, centred title above the subtly-framed
 * preview, which shows the WHOLE map. The card does not pick its own
 * size: the atlas camera computes the body's pixel size from the map's
 * tile dimensions and the current zoom, hands it to
 * {@link setBodySize}, then reads {@link cardWidth} / {@link cardHeight}
 * / {@link bodyOffsetX} / {@link bodyOffsetY} back to place the card so
 * the BODY lands exactly where the camera wants it. The card's own CSS
 * therefore carries neither padding nor border (`scene-card.css`).
 *
 * Drag semantics: a drag moves the card on the atlas
 * (`scene-drag-*`). The card emits the underlying
 * `Gtk.Button::clicked` signal on single click; double-clicks are
 * detected by listening to `clicked` and checking a debounce timer (no
 * native double-click signal on buttons).
 */
export class SceneCard extends Gtk.Button {
  declare _map: MiniMap
  declare _preview_slot: Adw.Bin
  declare _title_row: Gtk.Box

  private _sceneName = ''
  private _startMap = false
  private _lastClickMs = 0
  private _selected = false
  private _dragging = false
  // Press point in widget-local coords (captured at drag-begin) and
  // the same point in the parent (atlas Fixed) space — move deltas are
  // computed in parent space (see `_moveDeltaInParent` for why).
  private _pressLocal: Graphene.Point | null = null
  private _pressInParent: Graphene.Point | null = null
  /** Drag gesture on the card itself; created on first map, kept for life. */
  private _dragGesture: Gtk.GestureDrag | null = null
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneCard',
        Template,
        InternalChildren: ['map', 'preview_slot', 'title_row'],
        Properties: {
          'scene-name': GObject.ParamSpec.string(
            'scene-name',
            'Scene name',
            'Name shown above the map',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'start-map': GObject.ParamSpec.boolean(
            'start-map',
            'Start map',
            'Whether the game starts on this map (shows the start badge)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'scene-activated': {},
          'scene-drag-begin': {},
          'scene-drag-update': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] },
          'scene-drag-end': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] },
        },
      },
      SceneCard,
    )
  }

  declare connect: GObject.SignalMethods<this, SceneCardSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, SceneCardSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, SceneCardSignals>['emit']

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this, 'clicked', () => this._onClicked())
    const drag = this._ensureDragGesture()
    this._signals.connect(drag, 'drag-begin', (_g: Gtk.GestureDrag, x: number, y: number) => this._onDragBegin(x, y))
    this._signals.connect(drag, 'drag-update', (_g: Gtk.GestureDrag, dx: number, dy: number) =>
      this._onDragUpdate(dx, dy),
    )
    this._signals.connect(drag, 'drag-end', (_g: Gtk.GestureDrag, dx: number, dy: number) => this._onDragEnd(dx, dy))
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * `GtkButton` normally swallows drags into clicks; a dedicated
   * `GestureDrag` on the CAPTURE phase intercepts presses before the
   * button's own click handling. Created once and kept — `vfunc_unmap`
   * releases its handlers, not the controller.
   */
  private _ensureDragGesture(): Gtk.GestureDrag {
    if (this._dragGesture) return this._dragGesture
    const drag = new Gtk.GestureDrag()
    drag.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    this.add_controller(drag)
    this._dragGesture = drag
    return drag
  }

  private _onDragBegin(x: number, y: number): void {
    this._dragging = false
    this._pressLocal = new Graphene.Point()
    this._pressLocal.init(x, y)
    this._pressInParent = this._toParent(this._pressLocal)
  }

  private _onDragUpdate(dx: number, dy: number): void {
    if (!this._dragging && hasPassedDragThreshold(dx, dy)) {
      this._dragging = true
      this.emit('scene-drag-begin')
    }
    if (!this._dragging) return
    const delta = this._moveDeltaInParent(dx, dy)
    if (delta) this.emit('scene-drag-update', delta.x, delta.y)
  }

  private _onDragEnd(dx: number, dy: number): void {
    const wasRealDrag = this._dragging
    if (wasRealDrag) {
      const delta = this._moveDeltaInParent(dx, dy)
      if (delta) this.emit('scene-drag-end', delta.x, delta.y)
      // Reset the double-click timer so the trailing click can't
      // chain into a `scene-activated` (open) on the next press.
      this._lastClickMs = 0
    }
    this._pressLocal = null
    this._pressInParent = null
    if (wasRealDrag) this._suppressTrailingClick()
    else this._dragging = false
  }

  /**
   * Resolve the gesture's current pointer position into the PARENT's
   * coordinate space and return the delta against the captured press
   * point:
   *   current_widget_local = press_local + drag_offset (gesture-provided)
   *   current_in_parent    = compute_point(current_widget_local → parent)
   * The delta against `press_in_parent` is stable — it doesn't depend
   * on the card's current fixed-position, so moving the card mid-drag
   * can't make the gesture oscillate.
   */
  private _moveDeltaInParent(dx: number, dy: number): { x: number; y: number } | null {
    if (!this._pressLocal || !this._pressInParent) return null
    const currentLocal = new Graphene.Point()
    currentLocal.init(this._pressLocal.x + dx, this._pressLocal.y + dy)
    const currentInParent = this._toParent(currentLocal)
    if (!currentInParent) return null
    return {
      x: currentInParent.x - this._pressInParent.x,
      y: currentInParent.y - this._pressInParent.y,
    }
  }

  /**
   * Keep `_dragging` true through the trailing `GtkButton::clicked`
   * signal. GTK fires that synchronously from the same release event
   * when `GestureDrag` is on the CAPTURE phase, so listeners that
   * guard with `if (card.isDragging) return` (atlas-canvas's
   * `scene-selected` emit, this card's own `_onClicked`) bail without
   * firing — no auto-open mid-reorder and no spurious
   * `scene-activated`. Reset on the next idle tick so the suppression
   * window doesn't leak into a subsequent real click.
   */
  private _suppressTrailingClick(): void {
    this._dragging = true
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._dragging = false
      return false
    })
  }

  /**
   * Size the map body to `width × height` surface pixels. Everything
   * else about the card's geometry follows from this and the title's
   * natural size.
   */
  setBodySize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    // A `MiniMap` measures `cols * tilePx` and does NOT scale into its
    // allocation, so the sample-world path has to pick a tile size
    // that fits inside the framed slot — otherwise the mini-map's
    // natural size would push the slot (and with it the card) past
    // the size the camera asked for.
    if (this._preview_slot?.get_child() === (this._map as Gtk.Widget)) {
      this._map.tilePx = this._fittingTilePx(w, h)
    }
    this._preview_slot?.set_size_request(w, h)
  }

  /** Largest tile size at which the mini-map still fits the framed slot. */
  private _fittingTilePx(width: number, height: number): number {
    const cols = Math.max(this._map.cols, 1)
    const rows = Math.max(this._map.rows, 1)
    // The frame draws a 1 px border on each side, inside the request.
    const fit = Math.min((width - 2) / cols, (height - 2) / rows)
    return Math.max(1, Math.min(MINI_MAP_TILE_PX_MAX, Math.floor(fit)))
  }

  /** Total card width, in surface px — the wider of title and body. */
  get cardWidth(): number {
    return Math.max(this._naturalSize(this._title_row).width, this._naturalSize(this._preview_slot).width)
  }

  /** Total card height, in surface px — title, gap and body. */
  get cardHeight(): number {
    return this.bodyOffsetY + this._naturalSize(this._preview_slot).height
  }

  /** Body inset from the card's left edge (the title may be wider). */
  get bodyOffsetX(): number {
    return Math.round((this.cardWidth - this._naturalSize(this._preview_slot).width) / 2)
  }

  /** Body inset from the card's top edge — the title overhang. */
  get bodyOffsetY(): number {
    return this._naturalSize(this._title_row).height + TITLE_SPACING_PX
  }

  /**
   * Measured natural size of one child. Read back from GTK rather than
   * recomputed, so CSS padding and the frame's border are included
   * whichever way GTK accounts for a size request.
   */
  private _naturalSize(widget: Gtk.Widget | null): { width: number; height: number } {
    if (!widget) return { width: 0, height: 0 }
    const [, width] = widget.measure(Gtk.Orientation.HORIZONTAL, -1)
    const [, height] = widget.measure(Gtk.Orientation.VERTICAL, width)
    return { width, height }
  }

  /**
   * Translate a widget-local point to the immediate parent's coordinate
   * space. Returns `null` if there is no parent yet or the GTK
   * transform query failed (shouldn't happen for a realised, parented
   * widget).
   */
  private _toParent(point: Graphene.Point): Graphene.Point | null {
    const parent = this.get_parent()
    if (!parent) return null
    const [ok, result] = this.compute_point(parent, point)
    return ok ? result : null
  }

  get isDragging(): boolean {
    return this._dragging
  }

  /**
   * Where the press that started the current drag landed, in the atlas
   * surface's coords — or `null` outside a drag.
   *
   * Exposed so the canvas can ask what the press was ON before deciding
   * what the drag MEANS: a press on a door's drag handle re-aims that
   * door instead of moving the card. The card cannot answer that itself
   * (the handles belong to the overlay), and the point is already in the
   * surface space the overlay hit-tests in.
   */
  get pressInParent(): { x: number; y: number } | null {
    const point = this._pressInParent
    return point ? { x: point.x, y: point.y } : null
  }

  /** Mirror the design's "selected" outer ring via a style class. */
  set selected(value: boolean) {
    if (this._selected === value) return
    this._selected = value
    if (value) this.add_css_class('selected')
    else this.remove_css_class('selected')
  }

  get selected(): boolean {
    return this._selected ?? false
  }

  /** Populate the card from a sample-world scene descriptor. */
  setScene(scene: SampleScene): void {
    this._sceneName = scene.name
    this._map.tilePx = scene.tilePx
    if (scene.rows.length) {
      this._map.setRows(scene.rows)
    } else if (scene.cols && scene.previewRows) {
      this._map.setPlaceholder(scene.cols, scene.previewRows, scene.tilePx, scene.previewColor)
    } else {
      this._map.setRows([])
    }
    this.notify('scene-name')
  }

  /**
   * Swap the default `MiniMap` preview out for a host-provided widget
   * — typically a `MapPreview` rendering the scene's actual tiles for
   * real projects loaded from disk. Passing `null` reverts to the
   * built-in `MiniMap` (sample-data path).
   */
  setPreviewWidget(widget: Gtk.Widget | null): void {
    if (!this._preview_slot) return
    this._preview_slot.set_child(widget ?? this._map)
  }

  get sceneName(): string {
    return this._sceneName ?? ''
  }

  set sceneName(value: string) {
    this._sceneName = value
    this.notify('scene-name')
  }

  /** Whether the game starts here — shows the small start badge. */
  get startMap(): boolean {
    return this._startMap ?? false
  }

  set startMap(value: boolean) {
    if (this._startMap === value) return
    this._startMap = value
    this.notify('start-map')
  }

  private _onClicked(): void {
    if (this._dragging) return
    const now = Date.now()
    if (isDoubleClick(now, this._lastClickMs)) {
      this.emit('scene-activated')
      this._lastClickMs = 0
      return
    }
    this._lastClickMs = now
  }
}

GObject.type_ensure(SceneCard.$gtype)
