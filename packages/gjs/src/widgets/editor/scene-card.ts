import GObject from '@girs/gobject-2.0'
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

  private _sceneName = ''
  private _cols = 0
  private _rows = 0
  private _events = 0
  private _lastClickMs = 0
  private _selected = false
  private _dragStartX = 0
  private _dragStartY = 0
  private _dragging = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneCard',
        Template,
        InternalChildren: ['map'],
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
    drag.connect('drag-begin', (_g, _x, _y) => {
      this._dragStartX = 0
      this._dragStartY = 0
      this._dragging = false
    })
    drag.connect('drag-update', (_g, x, y) => {
      const dist = Math.hypot(x, y)
      if (!this._dragging && dist > 4) {
        this._dragging = true
        this.emit('scene-drag-begin')
      }
      if (this._dragging) {
        this._dragStartX = x
        this._dragStartY = y
        this.emit('scene-drag-update', x, y)
      }
    })
    drag.connect('drag-end', (_g, x, y) => {
      if (this._dragging) {
        this.emit('scene-drag-end', x, y)
        // Suppress the trailing `clicked` that GtkButton would otherwise
        // fire after a drag finishes.
        this._lastClickMs = 0
      }
      this._dragging = false
    })
    this.add_controller(drag)
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
