import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './floating-tool-rail.blp'

/**
 * Enumerable name of every tool surfaced by {@link FloatingToolRail}.
 *
 * Matches the `win.set-tool` action targets bound in the BLP template.
 */
export type EditorTool =
  | 'pencil'
  | 'bucket'
  | 'rect'
  | 'eraser'
  | 'eyedropper'
  | 'select'
  | 'stamp'
  | 'event'

/**
 * Vertical OSD column of editor tool toggles.
 *
 * Implementation note: the buttons are radio-grouped via Blueprint's
 * `group: btn_pencil` so that only one is active at a time; selection
 * is communicated to the parent window via the `win.set-tool` stateful
 * action (target = the tool's string id).
 *
 * Styled with `toolbar` + `osd` style classes — the same pair used by
 * Learn6502's floating run-toolbar.
 */
export class FloatingToolRail extends Adw.Bin {
  declare _btn_pencil: Gtk.ToggleButton
  declare _btn_bucket: Gtk.ToggleButton
  declare _btn_rect: Gtk.ToggleButton
  declare _btn_eraser: Gtk.ToggleButton
  declare _btn_eyedropper: Gtk.ToggleButton
  declare _btn_select: Gtk.ToggleButton
  declare _btn_stamp: Gtk.ToggleButton
  declare _btn_event: Gtk.ToggleButton

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingToolRail',
        Template,
        InternalChildren: [
          'btn_pencil',
          'btn_bucket',
          'btn_rect',
          'btn_eraser',
          'btn_eyedropper',
          'btn_select',
          'btn_stamp',
          'btn_event',
        ],
      },
      FloatingToolRail,
    )
  }

  /** Visually mark a tool active even if the host hasn't wired `win.set-tool`. */
  setActiveTool(tool: EditorTool): void {
    const map: Record<EditorTool, Gtk.ToggleButton> = {
      pencil: this._btn_pencil,
      bucket: this._btn_bucket,
      rect: this._btn_rect,
      eraser: this._btn_eraser,
      eyedropper: this._btn_eyedropper,
      select: this._btn_select,
      stamp: this._btn_stamp,
      event: this._btn_event,
    }
    map[tool].set_active(true)
  }

  /**
   * Enable / disable the **mutating** editing tools (pencil, bucket,
   * rect, eraser). Non-mutating tools — eyedropper, select, stamp,
   * event — stay enabled because they're either read-only or
   * concern higher-level placements rather than tile sprites, and
   * thus aren't blocked by a locked layer.
   *
   * Uses `sensitive` rather than disabling the `win.set-tool` action,
   * because the action is shared by all buttons and we only want a
   * subset greyed out. The buttons keep their radio-group membership
   * — so disabling the active button while it's selected leaves it
   * visually pressed (Gtk behavior) until the host switches to
   * another tool.
   */
  setEditingToolsEnabled(enabled: boolean): void {
    this._btn_pencil.set_sensitive(enabled)
    this._btn_bucket.set_sensitive(enabled)
    this._btn_rect.set_sensitive(enabled)
    this._btn_eraser.set_sensitive(enabled)
  }
}

GObject.type_ensure(FloatingToolRail.$gtype)
