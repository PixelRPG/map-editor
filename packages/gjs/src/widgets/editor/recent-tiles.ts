import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import {
  RECENT_BUTTON_PX,
  RECENT_PITCH_PX,
  RECENT_SWATCH_PX,
  RECENT_TILES_MAX,
  wholeCount,
} from './recent-tiles.geometry.ts'
import { RecentTilesLayout } from './recent-tiles-layout.ts'
import type { TileDescriptor } from './tile-palette.ts'
import { createSwatchWidget } from './tile-swatch.ts'

/** Gap between the strip and its "⌃". */
const EXPAND_GAP_PX = 4

/**
 * The phone bar's second row: the tiles this session has used, biggest
 * first, with the active one ringed.
 *
 * It exists so the commonest move on a phone — swapping between the two
 * or three tiles a meadow is made of — costs one tap instead of opening
 * the sheet, picking, and dismissing it. The trailing "⌃" opens the
 * sheet for everything else.
 *
 * The strip shows a WHOLE number of swatches: at 360 px six fit and the
 * seventh is not drawn at all, rather than sliced by the edge of the bar
 * — a cut tile is not an affordance, it reads as a defect. The strip it
 * replaces clipped through a `Gtk.ScrolledWindow`, and the eighth tile
 * ended up half under the "⌃". {@link RecentTilesLayout} decides the
 * count at every allocation from the real button widths, and reports one
 * swatch as the minimum so the strip can never be what holds the window
 * above the phone width.
 */
export class RecentTiles extends Adw.Bin {
  private _row: Gtk.Box
  private _expand: Gtk.Button
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
    this._row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: RECENT_PITCH_PX - RECENT_BUTTON_PX,
      hexpand: true,
    })
    this._row.add_css_class('recent-tiles')
    const outer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: EXPAND_GAP_PX })
    outer.append(this._row)

    this._expand = new Gtk.Button({ icon_name: 'go-up-symbolic', tooltip_text: _('More tiles') })
    this._expand.add_css_class('flat')
    this._expand.connect('clicked', () => this.emit('expand-requested'))
    outer.append(this._expand)
    this.set_child(outer)
    this.set_layout_manager(new RecentTilesLayout())
  }

  /** The swatch buttons in strip order — the probe reads their widths. */
  get tileButtons(): readonly Gtk.ToggleButton[] {
    return [...this._buttons.values()]
  }

  /** How many swatches the last allocation showed whole. */
  get shownCount(): number {
    return this.tileButtons.filter((button) => button.get_child_visible()).length
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

  // ---- RecentTilesHost, called by the layout manager ----

  firstTileMinPx(): number {
    const first = this.tileButtons[0]
    return first ? first.measure(Gtk.Orientation.HORIZONTAL, -1)[0] : 0
  }

  reservedPx(): number {
    return EXPAND_GAP_PX + this._expand.measure(Gtk.Orientation.HORIZONTAL, -1)[1]
  }

  fitTiles(rowPx: number): void {
    const buttons = this.tileButtons
    const widths = buttons.map((button) => button.measure(Gtk.Orientation.HORIZONTAL, -1)[1])
    const count = wholeCount(widths, this._row.get_spacing(), rowPx)
    for (const [index, button] of buttons.entries()) button.set_child_visible(index < count)
  }
}

GObject.type_ensure(RecentTiles.$gtype)
