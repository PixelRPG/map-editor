import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import Template from './context-chip.blp'

/**
 * Top-right OSD chip combining the active-tile and active-layer
 * selectors.
 *
 * Two pill-shaped `MenuButton`s separated by a vertical rule. Popovers
 * are attached externally via {@link ContextChip.setTilePopover} /
 * {@link ContextChip.setLayerPopover} so the parent (typically the
 * scene editor) controls their contents.
 */
export class ContextChip extends Adw.Bin {
  declare _inspector_toggle: Gtk.ToggleButton
  declare _tile_button: Gtk.MenuButton
  declare _layer_button: Gtk.MenuButton
  declare _tile_name: Gtk.Label
  declare _layer_name: Gtk.Label
  declare _tile_swatch: Gtk.Picture
  private _placeholderIcon: Gtk.IconPaintable | null = null

  private _tileName = ''
  private _layerName = ''
  private _showInspector = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgContextChip',
        Template,
        InternalChildren: ['inspector_toggle', 'tile_button', 'layer_button', 'tile_name', 'layer_name', 'tile_swatch'],
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
          // `SceneEditorView.show-inspector`), otherwise the first
          // click on a freshly-painted chrome is wasted resyncing
          // button↔state and the user has to click twice. Atlas-view
          // wires the same pattern directly in its blueprint; here we
          // expose the property so SceneEditorView's constructor can
          // bind into the chip from above.
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector sidebar is currently visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ContextChip,
    )
  }

  constructor() {
    super()
    // Belt-and-suspenders: enforce the swatch dimensions / no-shrink
    // policy in code. Blueprint sets the same properties but in
    // practice GTK / Adw negotiated us down to ~1px wide inside the
    // chip's horizontal box, so set them again on a freshly-bound
    // InternalChild where the call order is deterministic.
    this._tile_swatch.set_can_shrink(false)
    this._tile_swatch.set_content_fit(Gtk.ContentFit.FILL)
    this._tile_swatch.set_size_request(22, 22)
    this._tile_swatch.set_hexpand(false)
    this._tile_swatch.set_vexpand(false)
    this._tile_swatch.set_halign(Gtk.Align.CENTER)
    this._tile_swatch.set_valign(Gtk.Align.CENTER)
    // Eagerly install the grid-icon placeholder so the Picture
    // always has a paintable for measure() — without this, the
    // first measure() (before `setTilePaintable` ever runs) sees
    // an empty Picture, returns `natural=1, min=16`, and GTK4
    // logs `GtkPicture reported min width 16 and natural width 1
    // in measure()`. The placeholder is the same one we fall back
    // to for `setTilePaintable(null)`, so this is purely a
    // measure-time guarantee — `setTilePaintable(real)` replaces
    // it without any visual flash.
    this._tile_swatch.set_paintable(this._loadPlaceholderIcon())
  }

  get tileName(): string {
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

  setTilePopover(popover: Gtk.Popover): void {
    this._tile_button.set_popover(popover)
  }

  /**
   * Replace the active-tile swatch with a `Gdk.Paintable` rendering of
   * the currently-selected tile. Falls back to a `view-grid-symbolic`
   * icon paintable when called with `null` (no tileset yet).
   *
   * The swatch is a `Gtk.Picture`, not a `Gtk.Image`: Image's
   * `pixel-size` only applies to icon sources, so paintables landed
   * unsized and rendered nothing. Picture honours the BLP's
   * width/height-request + `content-fit: contain`.
   */
  setTilePaintable(paintable: Gdk.Paintable | null): void {
    if (paintable) {
      this._tile_swatch.set_paintable(paintable)
      return
    }
    this._tile_swatch.set_paintable(this._loadPlaceholderIcon())
  }

  /**
   * Lazily resolve the `view-grid-symbolic` icon as a paintable so we
   * can hand it to `Gtk.Picture`. Cached for reuse — the icon theme is
   * stable for the widget's lifetime.
   */
  private _loadPlaceholderIcon(): Gtk.IconPaintable {
    if (this._placeholderIcon) return this._placeholderIcon
    const display = this.get_display()
    const theme = Gtk.IconTheme.get_for_display(display)
    const scale = this.get_scale_factor()
    this._placeholderIcon = theme.lookup_icon('view-grid-symbolic', null, 22, scale, Gtk.TextDirection.NONE, 0)
    return this._placeholderIcon
  }

  setLayerPopover(popover: Gtk.Popover): void {
    this._layer_button.set_popover(popover)
  }
}

GObject.type_ensure(ContextChip.$gtype)
