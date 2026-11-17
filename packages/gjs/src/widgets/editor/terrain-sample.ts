import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import { TERRAIN_SAMPLE_COLUMNS, TERRAIN_SAMPLE_ROWS } from '@pixelrpg/engine'

import { fitTerrainGrid } from './terrain-thumbnail.geometry.ts'

/**
 * The definition dialog's live sample: the engine's fixed test shape
 * (`terrain-sample.ts`) painted with the tiles currently under the
 * frames, on the set's floor tile (TERRAIN.md § 5.2).
 *
 * This is the whole feedback loop of placing a block. A frame one row
 * off does not produce a subtly wrong table, it produces visible
 * rubble — shore pieces facing inland, corners that do not meet — and
 * that is legible to someone who has never heard the word "autotile".
 *
 * Pure view, like {@link TerrainThumbnail}: the host resolves the shape
 * to sprite ids through the engine and hands over paintables, so the
 * widget never sees a terrain table and the matching rule stays
 * unit-tested where it lives.
 */
export class TerrainSample extends Gtk.Widget {
  private _tiles: (Gdk.Paintable | null)[] = []
  private _floor: Gdk.Paintable | null = null
  private _tilePx = 16

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgTerrainSample' }, TerrainSample)
  }

  /**
   * Show one paintable per cell of the shape, row-major, `null` where
   * the shape is bare floor or the table has no entry at all.
   *
   * `floor` is drawn under every cell, terrain or not: the shape is a
   * window onto a map, and an overlay terrain (this pack's water is one)
   * is transparent at its edges. Without ground beneath it the sample
   * would show the dialog's background through the shore.
   */
  setTiles(tiles: readonly (Gdk.Paintable | null)[], floor: Gdk.Paintable | null, tilePx?: number): void {
    this._tiles = [...tiles]
    this._floor = floor
    if (tilePx && tilePx > 0) this._tilePx = tilePx
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    // Natural is the shape at 1×; minimum is half that, so a phone can
    // squeeze the sample without the dialog refusing to fit. The widget
    // scales to whatever it gets — `fitTerrainGrid` keeps the cells
    // whole pixels.
    const cells = orientation === Gtk.Orientation.HORIZONTAL ? TERRAIN_SAMPLE_COLUMNS : TERRAIN_SAMPLE_ROWS
    const natural = cells * this._tilePx
    return [Math.floor(natural / 2), natural, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const fit = fitTerrainGrid(
      this.get_width(),
      this.get_height(),
      this._tilePx,
      TERRAIN_SAMPLE_COLUMNS,
      TERRAIN_SAMPLE_ROWS,
    )
    if (!fit) return
    for (let index = 0; index < TERRAIN_SAMPLE_COLUMNS * TERRAIN_SAMPLE_ROWS; index++) {
      const x = fit.x + (index % TERRAIN_SAMPLE_COLUMNS) * fit.cell
      const y = fit.y + Math.floor(index / TERRAIN_SAMPLE_COLUMNS) * fit.cell
      this._paint(snapshot, this._floor, x, y, fit.cell)
      this._paint(snapshot, this._tiles[index] ?? null, x, y, fit.cell)
    }
  }

  private _paint(snapshot: Gtk.Snapshot, paintable: Gdk.Paintable | null, x: number, y: number, cell: number): void {
    if (!paintable) return
    const point = new Graphene.Point()
    point.x = x
    point.y = y
    snapshot.save()
    snapshot.translate(point)
    paintable.snapshot(snapshot, cell, cell)
    snapshot.restore()
  }
}

GObject.type_ensure(TerrainSample.$gtype)
