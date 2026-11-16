import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { CollisionPreset, collisionPresetOf, type SpriteDataSet } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { SignalScope } from '../../utils/signal-scope.ts'

import Template from './tile-inspector.blp'

/** Surface key matching the ComboRow's string-list positions. Mirror in the .blp. */
const SURFACE_KEYS = [null, 'grass', 'dirt', 'stone', 'wood', 'water', 'sand', 'snow'] as const
type SurfaceKey = (typeof SURFACE_KEYS)[number]

/**
 * Typed view of the signals {@link TileInspector} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface TileInspectorSignals extends Adw.Bin.SignalSignatures {
  'collision-changed': (preset: string) => void
  'surface-changed': (surface: string) => void
}

/** The tile size of the sheet a sprite comes from, in pixels. */
export interface TileSize {
  width: number
  height: number
}

/** Fallback tile size when the host does not know the sheet's grid. */
const FALLBACK_TILE_SIZE: TileSize = { width: 16, height: 16 }

/**
 * Right-pane inspector for the Tiles view. Shows the selected tile's
 * properties from the active sprite-set definition: a preview image,
 * the sprite's id/name, the "Can the hero walk here?" pictogram group
 * (writes `def.solid` + `def.colliders`), and a Surface ComboRow
 * (writes `def.tileProperties.surface`).
 *
 * Mutations are emitted as signals — the host (`TilesView` / app
 * window) owns the actual data mutation + persistence path. Pattern
 * mirrors `CastInspector`: presentational, never touches state
 * directly.
 */
export class TileInspector extends Adw.Bin {
  declare _preview: Gtk.Picture
  declare _title_label: Gtk.Label
  declare _collision_wrap: Adw.WrapBox
  declare _collision_whole: Adw.ToggleGroup
  declare _collision_halves: Adw.ToggleGroup
  declare _collision_corners: Adw.ToggleGroup
  declare _custom_hint: Gtk.Label
  declare _surface_row: Adw.ComboRow

  private _sprite: SpriteDataSet | null = null
  private _tileSize: TileSize = FALLBACK_TILE_SIZE
  /** Set during host-driven refresh so input changes don't loop back. */
  private _silentUpdate = false
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileInspector',
        Template,
        InternalChildren: [
          'preview',
          'title_label',
          'collision_wrap',
          'collision_whole',
          'collision_halves',
          'collision_corners',
          'custom_hint',
          'surface_row',
        ],
        Signals: {
          'collision-changed': { param_types: [GObject.TYPE_STRING] },
          'surface-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TileInspector,
    )
  }

  declare connect: GObject.SignalMethods<this, TileInspectorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TileInspectorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TileInspectorSignals>['emit']

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
  }

  /**
   * The three pictogram groups, in reading order. One logical choice
   * split across three widgets only because a toggle group cannot wrap
   * — see the .blp.
   */
  private get _collisionGroups(): Adw.ToggleGroup[] {
    return [this._collision_whole, this._collision_halves, this._collision_corners]
  }

  /**
   * The preset the pictograms currently mark, or `null` when the tile's
   * shape is a custom one no pictogram describes.
   */
  get activeCollisionName(): string | null {
    for (const group of this._collisionGroups) {
      const name = group.get_active_name()
      if (name) return name
    }
    return null
  }

  vfunc_map(): void {
    super.vfunc_map()
    for (const group of this._collisionGroups) {
      this._signals.connect(group, 'notify::active-name', () => this._onCollisionToggled(group))
    }
    this._signals.connect(this._surface_row, 'notify::selected', () => {
      if (this._silentUpdate || !this._sprite) return
      const key = SURFACE_KEYS[this._surface_row.get_selected()] ?? null
      // GObject signals expect concrete types — emit '' for "none" so
      // listeners can `value || undefined` cleanly.
      this.emit('surface-changed', key ?? '')
    })
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * A pictogram was picked. Clearing the other two groups re-enters this
   * handler with `active-name = null`, which the early return absorbs —
   * so the cross-group exclusion needs no re-entrancy flag of its own.
   */
  private _onCollisionToggled(source: Adw.ToggleGroup): void {
    if (this._silentUpdate || !this._sprite) return
    const name = source.get_active_name()
    // `null` means a group was unset, which happens when a sibling takes
    // the choice or while showing a Custom shape — never a user answer,
    // so there is nothing to write back.
    if (!name) return
    for (const group of this._collisionGroups) {
      if (group !== source) group.set_active_name(null)
    }
    this._custom_hint.set_visible(false)
    this.emit('collision-changed', name)
  }

  /**
   * Mark `name` in whichever group owns it and clear the rest. Asking
   * each group for the toggle keeps the whole-tile / half / corner
   * membership in the .blp instead of a second list here.
   */
  private _showCollision(name: string | null): void {
    for (const group of this._collisionGroups) {
      const owns = name !== null && group.get_toggle_by_name(name) !== null
      group.set_active_name(owns ? name : null)
    }
  }

  /** Enable or grey out all three pictogram groups at once. */
  private _setCollisionSensitive(sensitive: boolean): void {
    for (const group of this._collisionGroups) group.set_sensitive(sensitive)
  }

  /**
   * Update the inspector to reflect a different sprite. Pass `null`
   * to show the "no tile selected" placeholder state.
   */
  setSprite(sprite: SpriteDataSet | null, paintable: Gdk.Paintable | null, tileSize?: TileSize): void {
    this._sprite = sprite
    this._tileSize = tileSize ?? FALLBACK_TILE_SIZE
    this._silentUpdate = true
    try {
      if (sprite) {
        this._preview.set_paintable(paintable)
        const name = sprite.name ?? `Tile ${sprite.id}`
        this._title_label.set_label(name)
        const preset = collisionPresetOf(sprite, this._tileSize.width, this._tileSize.height)
        const custom = preset === CollisionPreset.Custom
        // No pictogram describes a custom shape, so none is active and
        // a hint says why — picking one would be a silent data loss.
        this._showCollision(custom ? null : preset)
        this._setCollisionSensitive(true)
        this._custom_hint.set_visible(custom)
        const surfaceValue = (sprite.tileProperties?.surface ?? null) as SurfaceKey | null
        const surfaceIdx = SURFACE_KEYS.indexOf(surfaceValue)
        this._surface_row.set_selected(surfaceIdx >= 0 ? surfaceIdx : 0)
        this._surface_row.set_sensitive(true)
      } else {
        this._preview.set_paintable(null)
        this._title_label.set_label(_('No tile selected'))
        this._showCollision(null)
        this._setCollisionSensitive(false)
        this._custom_hint.set_visible(false)
        this._surface_row.set_selected(0)
        this._surface_row.set_sensitive(false)
      }
    } finally {
      this._silentUpdate = false
    }
  }
}

GObject.type_ensure(TileInspector.$gtype)
