import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type { PageSlots } from './editor-pages.ts'
import Template from './right-inspector.blp'

/**
 * Right-side inspector for the scene editor.
 *
 * Hosts an `Adw.ViewStack` + `Adw.InlineViewSwitcher` with three pages:
 * **Brush**, **Layers**, **Selected** — and a fourth, **Game memory**,
 * that stands in for them during a test run. It does not own their content —
 * each page is an `Adw.Bin` slot the shell fills from its single
 * {@link EditorPages} set, which the phone sheet borrows instead when
 * the layout collapses.
 */
export class RightInspector extends Adw.Bin {
  declare _stack: Adw.ViewStack
  declare _brush_slot: Adw.Bin
  declare _layers_slot: Adw.Bin
  declare _selected_slot: Adw.Bin
  declare _memory_slot: Adw.Bin
  declare _switcher: Adw.InlineViewSwitcher

  private _pageBeforeMemory: string | null = null

  private _collapsed = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRightInspector',
        Template,
        InternalChildren: ['stack', 'brush_slot', 'layers_slot', 'selected_slot', 'memory_slot', 'switcher'],
        Properties: {
          'visible-page': GObject.ParamSpec.string(
            'visible-page',
            'Visible Page',
            'Name of the active page (brush, layers, selected)',
            GObject.ParamFlags.READWRITE,
            'brush',
          ),
          // Mirrors the parent view's `inspector-collapsed` — drives
          // the visibility of the in-overlay close button. See
          // `docs/concepts/responsive-chrome.md` § "In-overlay close
          // affordance".
          collapsed: GObject.ParamSpec.boolean(
            'collapsed',
            'Collapsed',
            'Whether the inspector is in overlay-drawer mode (narrow widths)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      RightInspector,
    )
  }

  /** The three bins the shell hands to `EditorPages.host` on wide layouts. */
  get pageSlots(): PageSlots {
    return {
      brush: this._brush_slot,
      layers: this._layers_slot,
      selected: this._selected_slot,
      memory: this._memory_slot,
    }
  }

  /**
   * Swap Brush and Layers for Game memory while a test run is on, and put
   * the page the person was on back afterwards. Selected stays: its state
   * cards carry the "active now" badge, which only means something while
   * the game runs.
   */
  set memoryMode(on: boolean) {
    if (on === (this._pageBeforeMemory !== null)) return
    for (const slot of [this._brush_slot, this._layers_slot]) {
      this._stack.get_page(slot).set_visible(!on)
    }
    this._stack.get_page(this._memory_slot).set_visible(on)
    if (on) {
      this._pageBeforeMemory = this.visiblePage
      this._stack.set_visible_child_name('memory')
    } else {
      this._stack.set_visible_child_name(this._pageBeforeMemory ?? 'brush')
      this._pageBeforeMemory = null
    }
  }

  get visiblePage(): string {
    return this._stack.get_visible_child_name() ?? 'brush'
  }

  set visiblePage(value: string) {
    this._stack.set_visible_child_name(value)
    this.notify('visible-page')
  }

  get collapsed(): boolean {
    return this._collapsed
  }

  set collapsed(value: boolean) {
    if (this._collapsed === value) return
    this._collapsed = value
    this.notify('collapsed')
  }
}

GObject.type_ensure(RightInspector.$gtype)
