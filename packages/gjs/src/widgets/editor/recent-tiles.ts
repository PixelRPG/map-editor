import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
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
import { TerrainThumbnail } from './terrain-thumbnail.ts'
import type { TileDescriptor } from './tile-palette.ts'
import { createSwatchWidget } from './tile-swatch.ts'

/** Gap between the strip and its "⌃". */
const EXPAND_GAP_PX = 4

/**
 * One entry of the strip: a single tile, or a terrain brush shown as the
 * 3×3 it paints.
 *
 * Both carry a `key` rather than an id because the two share no id space
 * — sheet-local tile indices are numbers, terrain ids are strings, and
 * tile 3 is not terrain "3". The host mints `tile:<index>` /
 * `terrain:<id>` and gets the same string back when the swatch is
 * tapped, so there is nothing to parse twice.
 */
export type RecentBrushDescriptor =
  | { readonly kind: 'tile'; readonly key: string; readonly tile: TileDescriptor }
  | {
      readonly kind: 'terrain'
      readonly key: string
      readonly name: string
      /** The nine sprites of the brush's sample patch, row-major. */
      readonly tiles: ReadonlyArray<Gdk.Paintable | null>
      readonly tilePx?: number
    }

/**
 * Typed view of the signals {@link RecentTiles} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface RecentTilesSignals extends Adw.Bin.SignalSignatures {
  'brush-selected': (key: string) => void
  'expand-requested': () => void
}

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
  private _buttons = new Map<string, Gtk.ToggleButton>()
  private _activeKey: string | null = null
  /** Set while a programmatic check is in flight, so it never re-emits. */
  private _echo = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRecentTiles',
        Signals: {
          // A swatch was tapped — the `key` of the entry, not an id.
          'brush-selected': { param_types: [GObject.TYPE_STRING] },
          // The "⌃" button was tapped — the host opens the brush sheet.
          'expand-requested': { param_types: [] },
        },
      },
      RecentTiles,
    )
  }

  declare connect: GObject.SignalMethods<this, RecentTilesSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, RecentTilesSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, RecentTilesSignals>['emit']

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

  /** Replace the strip; `brushes` is already in recency order. */
  setBrushes(brushes: readonly RecentBrushDescriptor[]): void {
    let child = this._row.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._row.remove(child)
      child = next
    }
    this._buttons.clear()

    let group: Gtk.ToggleButton | null = null
    for (const brush of brushes.slice(0, RECENT_TILES_MAX)) {
      const button = new Gtk.ToggleButton({ tooltip_text: recentTooltip(brush) })
      button.add_css_class('flat')
      button.add_css_class('recent-tile')
      button.set_child(recentSwatch(brush))
      if (group) button.set_group(group)
      else group = button
      button.connect('toggled', () => {
        if (this._echo || !button.get_active()) return
        this.emit('brush-selected', brush.key)
      })
      this._row.append(button)
      this._buttons.set(brush.key, button)
    }
    this.setActive(this._activeKey)
  }

  /** Ring the swatch for `key` without re-emitting; `null` clears. */
  setActive(key: string | null): void {
    this._activeKey = key
    this._echo = true
    try {
      for (const [brushKey, button] of this._buttons) {
        button.set_active(brushKey === key)
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

/** The swatch one entry shows: a tile picture, or the brush's patch. */
function recentSwatch(brush: RecentBrushDescriptor): Gtk.Widget {
  if (brush.kind === 'tile') return createSwatchWidget(brush.tile, RECENT_SWATCH_PX, RECENT_SWATCH_PX)
  // Same picture as the brush chip above the sheet, shrunk to the
  // strip's swatch — recognising it is the whole point of the strip.
  const thumb = new TerrainThumbnail({ box: RECENT_SWATCH_PX })
  thumb.setTiles(brush.tiles, brush.tilePx)
  return thumb
}

function recentTooltip(brush: RecentBrushDescriptor): string {
  return brush.kind === 'tile' ? (brush.tile.name ?? `Tile ${brush.tile.id}`) : brush.name
}

GObject.type_ensure(RecentTiles.$gtype)
