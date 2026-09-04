import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { SampleScene } from '../../__demo__/world-sample'
import { SignalScope } from '../../utils/signal-scope.ts'
import { MiniMap } from './mini-map'
import { dragModeFor, hasPassedDragThreshold, isDoubleClick, type SceneDragMode } from './scene-card.drag.ts'

import Template from './scene-card.blp'

GObject.type_ensure(MiniMap.$gtype)

/**
 * Single atlas-space card representing one scene.
 *
 * The card is a `Gtk.Button` styled `flat` so it picks up Adwaita's
 * focus/hover/press states for free. The host application positions the
 * card via `Gtk.Fixed.put(card, x, y)` and toggles the `selected`
 * style class on selection — that drives the accent ring.
 *
 * Layout: a free-floating title row (name + dimensions, no header
 * bar) above the subtly-framed preview; the viewport lock sits in the
 * preview's top-right overlay corner, the event-count badge in the
 * bottom-right.
 *
 * Drag semantics: with the lock CLOSED (default) a drag moves the
 * card on the atlas; with the lock OPEN it pans the map section
 * inside the preview (`preview-pan-*` signals). The lock is only
 * shown for viewport previews (`viewportLockable`) — sample worlds
 * keep plain drag-to-move.
 *
 * The card emits the underlying `Gtk.Button::clicked` signal on single
 * click; double-clicks are detected by listening to `clicked` and
 * checking a debounce timer (no native double-click signal on buttons).
 */
export class SceneCard extends Gtk.Button {
  declare _map: MiniMap
  declare _preview_slot: Adw.Bin
  declare _lock_button: Gtk.ToggleButton

  private _sceneName = ''
  private _cols = 0
  private _rows = 0
  private _events = 0
  private _lastClickMs = 0
  private _selected = false
  private _dragging = false
  private _viewportLockable = false
  /**
   * Whether the current press began on the lock toggle. The card is a
   * `Gtk.Button`, whose click gesture runs in the CAPTURE phase — the
   * nested `Gtk.ToggleButton` never receives the press, so the card
   * routes lock clicks manually in {@link _onClicked}.
   */
  private _pressOnLock = false
  /**
   * When true (lock open), dragging the preview content pans the map
   * section inside the card (`preview-pan-*` signals). When false
   * (lock closed — the default — or no viewport preview at all), any
   * drag moves the card. Driven by the lock toggle.
   */
  private _pannablePreview = false
  /** Current drag interpretation, decided at gesture-begin. */
  private _dragMode: SceneDragMode = 'move'
  /** Last emitted pan offset, for incremental `preview-pan-update`s. */
  private _lastPan = { dx: 0, dy: 0 }
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
        InternalChildren: ['map', 'preview_slot', 'lock_button'],
        Properties: {
          'scene-name': GObject.ParamSpec.string(
            'scene-name',
            'Scene name',
            'Name shown in the title bar',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'size-text': GObject.ParamSpec.string(
            'size-text',
            'Size text',
            'Formatted "cols × rows" caption',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'events-text': GObject.ParamSpec.string(
            'events-text',
            'Events text',
            'Formatted event-count badge label',
            GObject.ParamFlags.READABLE,
            '0',
          ),
          'has-events': GObject.ParamSpec.boolean(
            'has-events',
            'Has events',
            'Whether the events badge should be visible',
            GObject.ParamFlags.READABLE,
            false,
          ),
          'viewport-lockable': GObject.ParamSpec.boolean(
            'viewport-lockable',
            'Viewport lockable',
            'Whether the preview-viewport lock toggle is shown (viewport previews only)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'scene-activated': {},
          'scene-drag-begin': {},
          'scene-drag-update': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] },
          'scene-drag-end': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] },
          // Viewport panning (pannable-preview mode): incremental
          // widget-pixel deltas while dragging the preview content,
          // then one `preview-pan-end` for the host to persist.
          'preview-pan-update': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] },
          'preview-pan-end': {},
          // Lock state flipped (via the card toggle or
          // `previewUnlocked`). Payload: `true` = open/pannable.
          'lock-changed': { param_types: [GObject.TYPE_BOOLEAN] },
        },
      },
      SceneCard,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this, 'clicked', () => this._onClicked())
    const drag = this._ensureDragGesture()
    this._signals.connect(drag, 'drag-begin', (_g: Gtk.GestureDrag, x: number, y: number) => this._onDragBegin(x, y))
    this._signals.connect(drag, 'drag-update', (_g: Gtk.GestureDrag, dx: number, dy: number) =>
      this._onDragUpdate(dx, dy),
    )
    this._signals.connect(drag, 'drag-end', (_g: Gtk.GestureDrag, dx: number, dy: number) => this._onDragEnd(dx, dy))
    // The lock toggle drives the drag interpretation: closed (default)
    // = drags move the card, open = drags pan the preview section.
    if (this._lock_button) {
      this._signals.connect(this._lock_button, 'toggled', () => this._onLockToggled())
    }
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
    this._pressOnLock = this._isOnLock(x, y)
    this._dragMode = dragModeFor(this._pannablePreview, this._pressOnLock)
    this._lastPan = { dx: 0, dy: 0 }
    this._pressLocal = new Graphene.Point()
    this._pressLocal.init(x, y)
    this._pressInParent = this._toParent(this._pressLocal)
  }

  private _onDragUpdate(dx: number, dy: number): void {
    if (!this._dragging && hasPassedDragThreshold(dx, dy)) {
      this._dragging = true
      if (this._dragMode === 'move') this.emit('scene-drag-begin')
    }
    if (!this._dragging) return
    if (this._dragMode === 'pan') {
      this.emit('preview-pan-update', dx - this._lastPan.dx, dy - this._lastPan.dy)
      this._lastPan = { dx, dy }
      return
    }
    const delta = this._moveDeltaInParent(dx, dy)
    if (delta) this.emit('scene-drag-update', delta.x, delta.y)
  }

  private _onDragEnd(dx: number, dy: number): void {
    const wasRealDrag = this._dragging
    if (wasRealDrag && this._dragMode === 'pan') {
      this.emit('preview-pan-end')
      this._lastClickMs = 0
    } else if (wasRealDrag) {
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

  private _onLockToggled(): void {
    const open = this._lock_button.active
    this._pannablePreview = open
    this._lock_button.set_icon_name(open ? 'changes-allow-symbolic' : 'changes-prevent-symbolic')
    this._lock_button.set_tooltip_text(
      open ? _('Lock to move the card instead') : _('Unlock to pan the preview section'),
    )
    this.emit('lock-changed', open)
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
   * firing — no auto-open mid-reorder, no spurious `scene-activated`,
   * no select on a lock click. Reset on the next idle tick so the
   * suppression window doesn't leak into a subsequent real click.
   */
  private _suppressTrailingClick(): void {
    this._dragging = true
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._dragging = false
      return false
    })
  }

  /** Lock state — `true` = open (drag pans the preview section). */
  get previewUnlocked(): boolean {
    return this._lock_button?.active ?? false
  }

  set previewUnlocked(value: boolean) {
    if (!this._lock_button || this._lock_button.active === value) return
    this._lock_button.active = value
  }

  /**
   * Whether the pointer press at card-local `(x, y)` landed on the
   * lock toggle (whose drags should never pan the preview).
   */
  private _isOnLock(x: number, y: number): boolean {
    const picked = this.pick(x, y, Gtk.PickFlags.DEFAULT)
    let widget: Gtk.Widget | null = picked
    while (widget && widget !== (this as Gtk.Widget)) {
      if (widget === this._lock_button) return true
      widget = widget.get_parent()
    }
    return false
  }

  /** Show the viewport lock — set by the atlas for viewport previews. */
  set viewportLockable(value: boolean) {
    if (this._viewportLockable === value) return
    this._viewportLockable = value
    this.notify('viewport-lockable')
  }

  get viewportLockable(): boolean {
    return this._viewportLockable ?? false
  }

  /** See {@link _pannablePreview}. Driven by the lock toggle. */
  get pannablePreview(): boolean {
    return this._pannablePreview ?? false
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
    this._events = scene.events
    this._map.tilePx = scene.tilePx
    if (scene.rows.length) {
      this._cols = scene.rows[0]?.length ?? 0
      this._rows = scene.rows.length
      this._map.setRows(scene.rows)
    } else if (scene.cols && scene.previewRows) {
      this._cols = scene.cols
      this._rows = scene.previewRows
      this._map.setPlaceholder(scene.cols, scene.previewRows, scene.tilePx, scene.previewColor)
    } else {
      this._cols = 0
      this._rows = 0
      this._map.setRows([])
    }
    this.notify('scene-name')
    this.notify('size-text')
    this.notify('events-text')
    this.notify('has-events')
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

  get sizeText(): string {
    if (!this._cols || !this._rows) return ''
    return `${this._cols}×${this._rows}`
  }

  get eventsText(): string {
    return (this._events ?? 0).toString()
  }

  get hasEvents(): boolean {
    return (this._events ?? 0) > 0
  }

  private _onClicked(): void {
    if (this._dragging) return
    // Lock clicks: the card button claims every press in its CAPTURE
    // phase, so the nested toggle never fires — toggle it here and
    // suppress the host's `clicked` select handler.
    if (this._pressOnLock && this._viewportLockable) {
      this._pressOnLock = false
      this._lock_button.set_active(!this._lock_button.active)
      this._lastClickMs = 0
      this._suppressTrailingClick()
      return
    }
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
