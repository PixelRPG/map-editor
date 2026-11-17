import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import { type TerrainPreset, terrainPresetPart, terrainPresetSpec } from '@pixelrpg/engine'

/** Side of one drawn cell, and the gap that makes the cells read as tiles. */
const CELL = 9
const GAP = 1

/** The drawn block, when the theme has no accent to ask for. */
const ACCENT_FALLBACK = '#3584e4'

/**
 * A preset drawn as the SHAPE it is on the sheet: `ground-29` is a tall
 * 5×6 slab, `patch-13` a square with a small pair beside it, `block-9`
 * just the square.
 *
 * The preset picker is a question about a picture — "which of these
 * does my tileset look like?" — and three names in a list cannot be
 * answered by looking at the sheet. The silhouette can: it is the same
 * outline the next page frames on the sheet itself.
 *
 * Only the cells the preset actually uses are filled, so `ground-29`'s
 * one blank cell shows as a notch — which is what the author will see
 * when the frame lands on their artwork.
 */
export class TerrainPresetSilhouette extends Gtk.Widget {
  private _cells: { x: number; y: number }[] = []
  private _columns = 1
  private _rows = 1

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgTerrainPresetSilhouette' }, TerrainPresetSilhouette)
  }

  constructor(preset?: TerrainPreset | string) {
    super()
    if (preset !== undefined) this.setPreset(preset)
  }

  /** Draw this preset's cells, normalised so the top-left of the whole block is `0, 0`. */
  setPreset(preset: TerrainPreset | string): void {
    const spec = terrainPresetSpec(preset)
    const cells: { x: number; y: number }[] = []
    for (const cell of spec?.cells ?? []) {
      const part = spec ? terrainPresetPart(spec, cell.part) : undefined
      if (!part) continue
      cells.push({ x: part.dc + cell.dc, y: part.dr + cell.dr })
    }
    const minX = Math.min(0, ...cells.map((cell) => cell.x))
    const minY = Math.min(0, ...cells.map((cell) => cell.y))
    this._cells = cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    this._columns = Math.max(1, ...this._cells.map((cell) => cell.x + 1))
    this._rows = Math.max(1, ...this._cells.map((cell) => cell.y + 1))
    this.queue_resize()
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    const cells = orientation === Gtk.Orientation.HORIZONTAL ? this._columns : this._rows
    const size = cells * CELL
    return [size, size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const color = this._accentColor()
    for (const cell of this._cells) {
      const rect = new Graphene.Rect()
      rect.init(cell.x * CELL, cell.y * CELL, CELL - GAP, CELL - GAP)
      snapshot.append_color(color, rect)
    }
  }

  private _accentColor(): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color('accent_bg_color')
      if (found) return color
    } catch {
      // GTK4 deprecation may turn lookup_color into a no-op; fall back.
    }
    const rgba = new Gdk.RGBA()
    rgba.parse(ACCENT_FALLBACK)
    return rgba
  }
}
