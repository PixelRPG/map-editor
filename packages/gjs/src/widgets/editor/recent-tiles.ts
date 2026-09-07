import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import type { TileDescriptor } from './tile-palette.ts'
import { createSwatchWidget } from './tile-swatch.ts'

/** Side of one swatch, and the pitch it sits on. */
export const RECENT_SWATCH_PX = 40
export const RECENT_PITCH_PX = 48

/** Most recently used tiles the strip remembers. */
export const RECENT_TILES_MAX = 8

/**
 * Keep an LRU of tile ids with `id` at the front, capped at
 * {@link RECENT_TILES_MAX}. Pure, so the "painting a meadow alternates
 * two or three tiles and none of them falls off" claim is a unit test.
 */
export function pushRecent(recent: readonly number[], id: number): number[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_TILES_MAX)
}

/**
 * The phone bar's second row: the tiles this session has used, biggest
 * first, with the active one ringed.
 *
 * It exists so the commonest move on a phone — swapping between the two
 * or three tiles a meadow is made of — costs one tap instead of opening
 * the sheet, picking, and dismissing it. The trailing "⌃" opens the
 * sheet for everything else.
 */
export class RecentTiles extends Adw.Bin {
  private _row: Gtk.Box
  private _buttons = new Map<number, Gtk.ToggleButton>()
  private _activeId: number | null = null
  /** Set while a programmatic check is in flight, so it never re-emits. */
  private _echo = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRecentTiles',
        Signals: {
          // A swatch was tapped (local sheet index), mirroring TilePalette.
          'tile-selected': { param_types: [GObject.TYPE_INT] },
          // The "⌃" button was tapped — the host opens the brush sheet.
          'expand-requested': { param_types: [] },
        },
      },
      RecentTiles,
    )
  }

  constructor() {
    super()
    this._row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: RECENT_PITCH_PX - RECENT_SWATCH_PX })
    this._row.add_css_class('recent-tiles')
    const outer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
    // The strip is clipped, not wrapped: at 360 px six swatches fit and
    // the seventh is simply not drawn, rather than pushing the "⌃" off
    // the bar or growing the row to two lines.
    const clip = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.EXTERNAL,
      vscrollbar_policy: Gtk.PolicyType.NEVER,
      hexpand: true,
      propagate_natural_height: true,
    })
    clip.set_child(this._row)
    outer.append(clip)

    const expand = new Gtk.Button({ icon_name: 'go-up-symbolic', tooltip_text: _('More tiles') })
    expand.add_css_class('flat')
    expand.connect('clicked', () => this.emit('expand-requested'))
    outer.append(expand)
    this.set_child(outer)
  }

  /** Replace the strip; `tiles` is already in recency order. */
  setTiles(tiles: readonly TileDescriptor[]): void {
    let child = this._row.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._row.remove(child)
      child = next
    }
    this._buttons.clear()

    let group: Gtk.ToggleButton | null = null
    for (const tile of tiles.slice(0, RECENT_TILES_MAX)) {
      const button = new Gtk.ToggleButton({ tooltip_text: tile.name ?? `Tile ${tile.id}` })
      button.add_css_class('flat')
      button.add_css_class('recent-tile')
      button.set_child(createSwatchWidget(tile, RECENT_SWATCH_PX, RECENT_SWATCH_PX))
      if (group) button.set_group(group)
      else group = button
      button.connect('toggled', () => {
        if (this._echo || !button.get_active()) return
        this.emit('tile-selected', tile.id)
      })
      this._row.append(button)
      this._buttons.set(tile.id, button)
    }
    this.setActive(this._activeId)
  }

  /** Ring the swatch for `id` without re-emitting; `null` clears. */
  setActive(id: number | null): void {
    this._activeId = id
    this._echo = true
    try {
      for (const [tileId, button] of this._buttons) {
        button.set_active(tileId === id)
      }
    } finally {
      this._echo = false
    }
  }
}

GObject.type_ensure(RecentTiles.$gtype)
