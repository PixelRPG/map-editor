import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import type { SampleScene } from '../../__demo__/world-sample'
import { MiniMap } from './mini-map'

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
 * Layout: title bar (name + dimensions) on top, mini-map below; the
 * event-count badge floats in the top-right overlay corner.
 *
 * The card emits the underlying `Gtk.Button::clicked` signal on single
 * click; double-clicks are detected by listening to `clicked` and
 * checking a debounce timer (no native double-click signal on buttons).
 */
export class SceneCard extends Gtk.Button {
  declare _map: MiniMap
  declare _preview_slot: Adw.Bin

  private _sceneName = ''
  private _cols = 0
  private _rows = 0
  private _events = 0
  private _lastClickMs = 0
  private _selected = false
  private _dragging = false
  // Press point in widget-local coords (captured at drag-begin) and the
  // same point translated into the parent (atlas Fixed) coordinate
  // space. We compute deltas in *parent* space so that moving the card
  // during drag-update doesn't shift the widget-local origin and cause
  // the gesture to oscillate between positions. Without this trick a
  // big card visibly flickers between its old and new position on
  // every mouse motion event.
  private _pressLocal: Graphene.Point | null = null
  private _pressInParent: Graphene.Point | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneCard',
        Template,
        InternalChildren: ['map', 'preview_slot'],
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

  constructor() {
    super()
    this.connect('clicked', this._onClicked.bind(this))

    // Drag support: GtkButton normally swallows drags into clicks; add a
    // dedicated GestureDrag with `propagation-phase: capture` so we can
    // intercept presses before the button's own click handling.
    const drag = new Gtk.GestureDrag()
    drag.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    drag.connect('drag-begin', (_g, x, y) => {
      this._dragging = false
      this._pressLocal = new Graphene.Point()
      this._pressLocal.init(x, y)
      this._pressInParent = this._toParent(this._pressLocal)
    })
    drag.connect('drag-update', (_g, dx, dy) => {
      const dist = Math.hypot(dx, dy)
      if (!this._dragging && dist > 4) {
        this._dragging = true
        this.emit('scene-drag-begin')
      }
      if (!this._dragging || !this._pressLocal || !this._pressInParent) return
      // Resolve the current cursor position in PARENT space:
      //   current_widget_local = press_local + drag_offset (gesture-provided)
      //   current_in_parent     = compute_point(current_widget_local → parent)
      // Then the delta against the captured press_in_parent is stable —
      // it doesn't depend on the card's current fixed-position.
      const currentLocal = new Graphene.Point()
      currentLocal.init(this._pressLocal.x + dx, this._pressLocal.y + dy)
      const currentInParent = this._toParent(currentLocal)
      if (!currentInParent) return
      this.emit(
        'scene-drag-update',
        currentInParent.x - this._pressInParent.x,
        currentInParent.y - this._pressInParent.y,
      )
    })
    drag.connect('drag-end', (_g, dx, dy) => {
      const wasRealDrag = this._dragging
      if (wasRealDrag && this._pressLocal && this._pressInParent) {
        const currentLocal = new Graphene.Point()
        currentLocal.init(this._pressLocal.x + dx, this._pressLocal.y + dy)
        const currentInParent = this._toParent(currentLocal)
        if (currentInParent) {
          this.emit(
            'scene-drag-end',
            currentInParent.x - this._pressInParent.x,
            currentInParent.y - this._pressInParent.y,
          )
        }
        // Reset the double-click timer so the trailing click can't
        // chain into a `scene-activated` (open) on the next press.
        this._lastClickMs = 0
      }
      this._pressLocal = null
      this._pressInParent = null
      if (wasRealDrag) {
        // Keep `_dragging` true through the trailing `GtkButton::clicked`
        // signal. GTK fires that synchronously from the same release
        // event when `GestureDrag` is on the CAPTURE phase, so the
        // listeners that already guard with `if (card.isDragging)
        // return` (atlas-canvas's `scene-selected` emit, this card's
        // own `_onClicked`) bail without firing — no auto-open mid-
        // reorder, no spurious `scene-activated`. Reset on the next
        // idle tick so the suppression window doesn't leak into a
        // subsequent real click.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          this._dragging = false
          return false
        })
      } else {
        this._dragging = false
      }
    })
    this.add_controller(drag)
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
    const now = Date.now()
    if (now - this._lastClickMs < 350) {
      this.emit('scene-activated')
      this._lastClickMs = 0
      return
    }
    this._lastClickMs = now
  }
}

GObject.type_ensure(SceneCard.$gtype)
