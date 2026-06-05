import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { EditorTool } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { SignalScope } from '../../utils/signal-scope'

import Template from './floating-top-bar.blp'

/** Icon used to represent each editor tool — shared between the
 * collapsed MenuButton icon and the tool popover entries. Order in
 * the record drives popover ordering (`Object.keys` is insertion-
 * ordered for string keys); `'select'` is listed first because it's
 * the default and the read-only inspection entry-point. */
const TOOL_ICONS: Record<EditorTool, string> = {
  select: 'edit-select-symbolic',
  pencil: 'document-edit-symbolic',
  eraser: 'edit-clear-all-symbolic',
  eyedropper: 'color-select-symbolic',
}

const TOOL_LABELS: Record<EditorTool, () => string> = {
  select: () => _('Select'),
  pencil: () => _('Pencil'),
  eraser: () => _('Eraser'),
  eyedropper: () => _('Eyedropper'),
}

/**
 * Self-aware top-of-canvas OSD chrome for the scene editor.
 *
 * The bar contains an `Adw.BreakpointBin` that watches its own
 * allocated width and toggles its children's visibility directly —
 * no external responsive logic, no property chain to the host. Two
 * full button hierarchies coexist in the template:
 *
 * - `split_root` (≥ 880sp) — desktop layout, two `toolbar.osd`
 *   pills with a central spacer.
 * - `merged_root` (< 880sp) — single full-width pill. Secondary
 *   buttons default hidden and surface progressively as more
 *   horizontal space becomes available; anything still hidden lives
 *   in the overflow menu, which this class rebuilds (`_updateOverflowMenu`)
 *   so it never duplicates a visible button.
 *
 * Host-provided popovers (`setTilePopover` / `setLayerPopover`) and
 * the host-built tool popover are re-attached to the currently-visible
 * MenuButton when the split↔merged transition fires.
 */
export class FloatingTopBar extends Adw.Bin {
  // Layout roots
  declare _split_root: Gtk.Box
  declare _merged_root: Gtk.Box

  // Split-layout widgets
  declare _library_toggle_split: Gtk.ToggleButton
  declare _back_button_split: Gtk.Button
  declare _undo_button_split: Gtk.Button
  declare _redo_button_split: Gtk.Button
  declare _grid_button_split: Gtk.ToggleButton
  declare _transparency_button_split: Gtk.ToggleButton
  declare _tool_button_split: Gtk.MenuButton
  declare _tile_button_split: Gtk.MenuButton
  declare _tile_swatch_split: Gtk.Picture
  declare _layer_button_split: Gtk.MenuButton
  declare _inspector_toggle_split: Gtk.ToggleButton

  // Merged-layout widgets
  declare _library_toggle_merged: Gtk.ToggleButton
  declare _back_button_merged: Gtk.Button
  declare _undo_button_merged: Gtk.Button
  declare _redo_button_merged: Gtk.Button
  declare _grid_button_merged: Gtk.ToggleButton
  declare _transparency_button_merged: Gtk.ToggleButton
  declare _overflow_button_merged: Gtk.MenuButton
  declare _tool_button_merged: Gtk.MenuButton
  declare _tile_button_merged: Gtk.MenuButton
  declare _tile_swatch_merged: Gtk.Picture
  declare _layer_button_merged: Gtk.MenuButton
  declare _inspector_toggle_merged: Gtk.ToggleButton
  declare _merged_tile_label: Gtk.Label
  declare _merged_layer_label: Gtk.Label

  private _placeholderIcon: Gtk.IconPaintable | null = null
  private _tileName = ''
  private _layerName = ''
  private _showInspector = false
  private _tilePopover: Gtk.Popover | null = null
  private _layerPopover: Gtk.Popover | null = null
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingTopBar',
        Template,
        InternalChildren: [
          'split_root',
          'merged_root',
          'library_toggle_split',
          'back_button_split',
          'undo_button_split',
          'redo_button_split',
          'grid_button_split',
          'transparency_button_split',
          'tool_button_split',
          'tile_button_split',
          'tile_swatch_split',
          'layer_button_split',
          'inspector_toggle_split',
          'library_toggle_merged',
          'back_button_merged',
          'undo_button_merged',
          'redo_button_merged',
          'grid_button_merged',
          'transparency_button_merged',
          'overflow_button_merged',
          'tool_button_merged',
          'tile_button_merged',
          'tile_swatch_merged',
          'layer_button_merged',
          'inspector_toggle_merged',
          'merged_tile_label',
          'merged_layer_label',
        ],
        Properties: {
          'tile-name': GObject.ParamSpec.string(
            'tile-name',
            'Tile Name',
            'Name of the active tile',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'layer-name': GObject.ParamSpec.string(
            'layer-name',
            'Layer Name',
            'Name of the active layer',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // Mirrors the rest of the editor chrome: the inspector
          // toggle's `active` state has to round-trip with whatever
          // drives the sidebar's visibility (the host
          // `ApplicationWindow.show-inspector`), otherwise the first
          // click on a freshly-painted chrome is wasted resyncing
          // button↔state and the user has to click twice.
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector sidebar is currently visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      FloatingTopBar,
    )
  }

  constructor() {
    super()
    // Enforce swatch geometry in code — Blueprint sets the same
    // properties but GTK negotiates `Gtk.Picture` down to ~1px in
    // horizontal Box layouts. Setting them again on a freshly-bound
    // InternalChild keeps the call order deterministic. Also eagerly
    // install the grid-icon placeholder so the first measure() (before
    // `setTilePaintable` ever runs) doesn't log "min width 16 and
    // natural width 1".
    for (const swatch of [this._tile_swatch_split, this._tile_swatch_merged]) {
      swatch.set_can_shrink(false)
      swatch.set_content_fit(Gtk.ContentFit.FILL)
      swatch.set_size_request(22, 22)
      swatch.set_hexpand(false)
      swatch.set_vexpand(false)
      swatch.set_halign(Gtk.Align.CENTER)
      swatch.set_valign(Gtk.Align.CENTER)
      swatch.set_paintable(this._loadPlaceholderIcon())
    }

    // Tool popover — separate instance per MenuButton since a single
    // popover can only have one parent at a time. The popover content
    // is identical so we just build it twice.
    this._tool_button_split.set_popover(this._buildToolPopover())
    this._tool_button_merged.set_popover(this._buildToolPopover())

    // Initial overflow contents — listeners are wired in `vfunc_map`
    // per the [DO] connect-in-map / disconnect-in-unmap convention.
    this._updateOverflowMenu()
  }

  vfunc_map(): void {
    super.vfunc_map()
    // Rebuild the overflow menu whenever a merged action button's
    // visibility flips (the BLP breakpoint chain raises / lowers them);
    // also re-attach host popovers when the layout transitions between
    // split and merged.
    for (const btn of [
      this._back_button_merged,
      this._undo_button_merged,
      this._grid_button_merged,
      this._transparency_button_merged,
    ]) {
      this._signals.connect(btn, 'notify::visible', () => this._updateOverflowMenu())
    }
    this._signals.connect(this._split_root, 'notify::visible', () => this._applyHostPopovers())
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  get tileName(): string {
    // Defensive `?? ''`: GTK4 calls this getter during template
    // `_instance_init` (before the TS constructor body runs the
    // class-field initialisers), so `_tileName` is briefly
    // `undefined` and the GObject ParamSpec rejects the read with
    // "Wrong type undefined; string expected".
    return this._tileName ?? ''
  }

  set tileName(value: string) {
    if (this._tileName === value) return
    this._tileName = value
    this.notify('tile-name')
  }

  get layerName(): string {
    return this._layerName ?? ''
  }

  set layerName(value: string) {
    if (this._layerName === value) return
    this._layerName = value
    this.notify('layer-name')
  }

  get showInspector(): boolean {
    return this._showInspector
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  /**
   * Update both tool MenuButtons' icons to reflect the active tool.
   * The popovers' tool entries don't need updating — they're stateful
   * action targets, so the menu reads the current state itself.
   */
  setActiveTool(tool: EditorTool): void {
    const icon = TOOL_ICONS[tool]
    this._tool_button_split.set_icon_name(icon)
    this._tool_button_merged.set_icon_name(icon)
  }

  setTilePopover(popover: Gtk.Popover): void {
    this._tilePopover = popover
    this._applyHostPopovers()
  }

  setLayerPopover(popover: Gtk.Popover): void {
    this._layerPopover = popover
    this._applyHostPopovers()
  }

  /**
   * Replace the active-tile swatch with a Gdk.Paintable rendering of
   * the currently-selected tile, on BOTH layouts. Falls back to a
   * `view-grid-symbolic` icon paintable when called with `null`.
   */
  setTilePaintable(paintable: Gdk.Paintable | null): void {
    const target = paintable ?? this._loadPlaceholderIcon()
    this._tile_swatch_split.set_paintable(target)
    this._tile_swatch_merged.set_paintable(target)
  }

  /**
   * A `Gtk.Popover` can only be attached to one `Gtk.MenuButton` at a
   * time, so re-attach the host-provided tile/layer popovers to the
   * currently-visible MenuButton on every split↔merged transition.
   */
  private _applyHostPopovers(): void {
    const splitVisible = this._split_root.get_visible()
    if (this._tilePopover) {
      const active = splitVisible ? this._tile_button_split : this._tile_button_merged
      const inactive = splitVisible ? this._tile_button_merged : this._tile_button_split
      inactive.set_popover(null)
      active.set_popover(this._tilePopover)
    }
    if (this._layerPopover) {
      const active = splitVisible ? this._layer_button_split : this._layer_button_merged
      const inactive = splitVisible ? this._layer_button_merged : this._layer_button_split
      inactive.set_popover(null)
      active.set_popover(this._layerPopover)
    }
  }

  /**
   * Custom Gtk.Popover for the tool MenuButton — a vertical Box of
   * flat Buttons, each with a full-size icon next to its label. Each
   * button binds the same stateful `win.set-tool` action with a
   * different target value, so clicking still routes through the
   * action's `change-state` handler. The trade for the custom popover
   * vs a Gio.Menu: no radio-style checkmark (the collapsed MenuButton
   * icon already encodes the active tool).
   */
  private _buildToolPopover(): Gtk.Popover {
    const popover = new Gtk.Popover()
    popover.add_css_class('menu')

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 0,
      margin_top: 4,
      margin_bottom: 4,
      margin_start: 4,
      margin_end: 4,
    })

    for (const tool of Object.keys(TOOL_ICONS) as EditorTool[]) {
      const button = new Gtk.Button({
        action_name: 'win.set-tool',
        action_target: GLib.Variant.new_string(tool),
        css_classes: ['flat'],
      })
      const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 })
      row.append(new Gtk.Image({ icon_name: TOOL_ICONS[tool] }))
      row.append(
        new Gtk.Label({
          label: TOOL_LABELS[tool](),
          halign: Gtk.Align.START,
          hexpand: true,
        }),
      )
      button.set_child(row)
      button.connect('clicked', () => popover.popdown())
      box.append(button)
    }

    popover.set_child(box)
    return popover
  }

  /**
   * Rebuild the merged-layout's overflow popover-menu so it only
   * contains entries that are NOT currently surfaced as standalone
   * buttons — no duplicates between bar and menu. Reads each merged
   * action button's `visible` (set by the BreakpointBin chain) and
   * adds the corresponding section to the menu when the button is
   * hidden. The overflow MenuButton's own visibility is controlled
   * by the BLP breakpoint, not this method.
   */
  private _updateOverflowMenu(): void {
    const root = new Gio.Menu()

    if (!this._back_button_merged.get_visible()) {
      const nav = new Gio.Menu()
      nav.append(_('Back to Atlas'), 'win.back-to-atlas')
      root.append_section(null, nav)
    }

    if (!this._undo_button_merged.get_visible()) {
      const history = new Gio.Menu()
      history.append(_('Undo'), 'win.undo')
      history.append(_('Redo'), 'win.redo')
      root.append_section(null, history)
    }

    // Grid + transparency promote at the same breakpoint, so they're
    // either both visible (no overflow entry) or both hidden (one
    // shared view section in the overflow). Combining them into one
    // section keeps the "≥ 2 entries per section" rule satisfied
    // when only one happens to be hidden during a transition tick.
    if (!this._grid_button_merged.get_visible() || !this._transparency_button_merged.get_visible()) {
      const view = new Gio.Menu()
      if (!this._grid_button_merged.get_visible()) view.append(_('Show Grid'), 'win.toggle-grid')
      if (!this._transparency_button_merged.get_visible()) {
        view.append(_('Dim Other Layers'), 'win.toggle-transparency')
      }
      root.append_section(null, view)
    }

    this._overflow_button_merged.set_menu_model(root)
  }

  private _loadPlaceholderIcon(): Gtk.IconPaintable {
    if (this._placeholderIcon) return this._placeholderIcon
    const display = this.get_display()
    const theme = Gtk.IconTheme.get_for_display(display)
    const scale = this.get_scale_factor()
    this._placeholderIcon = theme.lookup_icon('view-grid-symbolic', null, 22, scale, Gtk.TextDirection.NONE, 0)
    return this._placeholderIcon
  }
}

GObject.type_ensure(FloatingTopBar.$gtype)
