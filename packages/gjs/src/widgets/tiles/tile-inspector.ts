import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { SpriteDataSet } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import Template from './tile-inspector.blp'

/** Surface key matching the ComboRow's string-list positions. Mirror in the .blp. */
const SURFACE_KEYS = [null, 'grass', 'dirt', 'stone', 'wood', 'water', 'sand', 'snow'] as const
type SurfaceKey = (typeof SURFACE_KEYS)[number]

/**
 * Right-pane inspector for the Tiles view. Shows the selected tile's
 * properties from the active sprite-set definition: a preview image,
 * the sprite's id/name, a Solid switch (writes `def.solid`), and a
 * Surface ComboRow (writes `def.tileProperties.surface`).
 *
 * Mutations are emitted as signals — the host (`TilesView` / app
 * window) owns the actual data mutation + persistence path. Pattern
 * mirrors `CastInspector`: presentational, never touches state
 * directly.
 */
export class TileInspector extends Adw.Bin {
  declare _preview: Gtk.Picture
  declare _title_label: Gtk.Label
  declare _solid_row: Adw.SwitchRow
  declare _surface_row: Adw.ComboRow

  private _sprite: SpriteDataSet | null = null
  /** Set during host-driven refresh so input changes don't loop back. */
  private _silentUpdate = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileInspector',
        Template,
        InternalChildren: ['preview', 'title_label', 'solid_row', 'surface_row'],
        Signals: {
          'solid-changed': { param_types: [GObject.TYPE_BOOLEAN] },
          'surface-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TileInspector,
    )
  }

  constructor() {
    super()
    // Belt-and-suspenders: re-apply the no-shrink + fixed-size policy
    // in code. Blueprint sets the same properties but in practice
    // GTK / Adw negotiates the Picture down to ~1 px wide inside the
    // surrounding Frame / ScrolledWindow on first allocation
    // (observed: preview = 1 px in #48). Mirrors the same fix in
    // `floating-top-bar.ts`'s tile_swatch constructor.
    this._preview.set_can_shrink(false)
    this._preview.set_content_fit(Gtk.ContentFit.FILL)
    this._preview.set_size_request(80, 80)
    this._preview.set_hexpand(false)
    this._preview.set_vexpand(false)
    this._preview.set_halign(Gtk.Align.CENTER)
    this._preview.set_valign(Gtk.Align.CENTER)

    this._solid_row.connect('notify::active', () => {
      if (this._silentUpdate || !this._sprite) return
      this.emit('solid-changed', this._solid_row.get_active())
    })
    this._surface_row.connect('notify::selected', () => {
      if (this._silentUpdate || !this._sprite) return
      const idx = this._surface_row.get_selected()
      const key = SURFACE_KEYS[idx] ?? null
      // GObject signals expect concrete types — emit '' for "none" so
      // listeners can `value || undefined` cleanly.
      this.emit('surface-changed', key ?? '')
    })
  }

  /**
   * Update the inspector to reflect a different sprite. Pass `null`
   * to show the "no tile selected" placeholder state.
   */
  setSprite(sprite: SpriteDataSet | null, paintable: Gdk.Paintable | null): void {
    this._sprite = sprite
    this._silentUpdate = true
    try {
      if (sprite) {
        this._preview.set_paintable(paintable)
        const name = sprite.name ?? `Tile ${sprite.id}`
        this._title_label.set_label(name)
        this._solid_row.set_active(sprite.solid === true)
        this._solid_row.set_sensitive(true)
        const surfaceValue = (sprite.tileProperties?.surface ?? null) as SurfaceKey | null
        const surfaceIdx = SURFACE_KEYS.indexOf(surfaceValue)
        this._surface_row.set_selected(surfaceIdx >= 0 ? surfaceIdx : 0)
        this._surface_row.set_sensitive(true)
      } else {
        this._preview.set_paintable(null)
        this._title_label.set_label(_('No tile selected'))
        this._solid_row.set_active(false)
        this._solid_row.set_sensitive(false)
        this._surface_row.set_selected(0)
        this._surface_row.set_sensitive(false)
      }
    } finally {
      this._silentUpdate = false
    }
  }
}

GObject.type_ensure(TileInspector.$gtype)
