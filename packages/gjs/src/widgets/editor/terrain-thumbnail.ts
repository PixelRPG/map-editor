import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import { fitTerrainPatch, TERRAIN_PATCH_CELLS, TERRAIN_THUMB_PX } from './terrain-thumbnail.geometry.ts'

/** The two greys behind the patch, so a transparent corner still reads as a corner. */
const CHECKER_LIGHT = 'rgba(255,255,255,0.22)'
const CHECKER_DARK = 'rgba(0,0,0,0.22)'

/** Side of one checkerboard square, as a share of a drawn cell. */
const CHECKER_DIVISOR = 2

/**
 * A terrain brush as the patch it paints: the 3×3 the engine resolves
 * for a lone blob of this terrain, drawn over a checkerboard.
 *
 * A chip showing a single sprite would be a brown square for "Path" and
 * a blue square for "Water" — indistinguishable from the thousand other
 * tiles on the sheet, and silent about the one thing that makes a brush
 * a brush: that the edges and corners pick themselves. Nine sprites say
 * it without a word of explanation, which is what a seven-year-old gets
 * to read.
 *
 * Pure view: the host resolves the nine sprite ids (engine's
 * `terrainPreviewSpriteIds`) and hands over their paintables, so this
 * widget never touches a terrain table.
 */
export class TerrainThumbnail extends Gtk.Widget {
  private _tiles: (Gdk.Paintable | null)[] = []
  private _tilePx: number
  private _box: number

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgTerrainThumbnail' }, TerrainThumbnail)
  }

  constructor(options: { box?: number; tilePx?: number } = {}) {
    super()
    this._box = options.box ?? TERRAIN_THUMB_PX
    this._tilePx = options.tilePx ?? TERRAIN_THUMB_PX / TERRAIN_PATCH_CELLS
  }

  /**
   * Show these nine sprites, row-major from the top-left. A `null` entry
   * (or a short list) leaves that cell as bare checkerboard rather than
   * guessing — an incomplete table is the author's to see.
   */
  setTiles(tiles: readonly (Gdk.Paintable | null)[], tilePx?: number): void {
    this._tiles = [...tiles]
    if (tilePx && tilePx > 0) this._tilePx = tilePx
    this.queue_draw()
  }

  vfunc_measure(_orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    // Minimum == natural: the chip's whole job is to show the patch at a
    // readable size, and a squeezed one would scale differently from the
    // chip beside it.
    return [this._box, this._box, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const width = this.get_width()
    const height = this.get_height()
    const fit = fitTerrainPatch(width, height, this._tilePx)
    if (!fit) return
    const patch = fit.cell * TERRAIN_PATCH_CELLS
    this._drawChecker(snapshot, fit.x, fit.y, patch, Math.max(1, Math.floor(fit.cell / CHECKER_DIVISOR)))
    for (let index = 0; index < TERRAIN_PATCH_CELLS * TERRAIN_PATCH_CELLS; index++) {
      const paintable = this._tiles[index]
      if (!paintable) continue
      const point = new Graphene.Point()
      point.x = fit.x + (index % TERRAIN_PATCH_CELLS) * fit.cell
      point.y = fit.y + Math.floor(index / TERRAIN_PATCH_CELLS) * fit.cell
      snapshot.save()
      snapshot.translate(point)
      paintable.snapshot(snapshot, fit.cell, fit.cell)
      snapshot.restore()
    }
  }

  private _drawChecker(snapshot: Gtk.Snapshot, x: number, y: number, size: number, cell: number): void {
    const light = parseColor(CHECKER_LIGHT)
    const dark = parseColor(CHECKER_DARK)
    const cells = Math.ceil(size / cell)
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const square = new Graphene.Rect()
        const w = Math.min(cell, size - col * cell)
        const h = Math.min(cell, size - row * cell)
        square.init(x + col * cell, y + row * cell, w, h)
        snapshot.append_color((row + col) % 2 === 0 ? light : dark, square)
      }
    }
  }
}

/** `Gdk.RGBA` from a CSS colour string — the checkerboard's two greys. */
function parseColor(css: string): Gdk.RGBA {
  const rgba = new Gdk.RGBA()
  rgba.parse(css)
  return rgba
}

GObject.type_ensure(TerrainThumbnail.$gtype)
