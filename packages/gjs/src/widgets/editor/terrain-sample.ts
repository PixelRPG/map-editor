import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import { TERRAIN_SAMPLE_COLUMNS, TERRAIN_SAMPLE_ROWS } from '@pixelrpg/engine'

import { SignalScope } from '../../utils/signal-scope.ts'
import { fitTerrainGrid, terrainGridCellAt } from './terrain-thumbnail.geometry.ts'

const ACCENT_FALLBACK = '#3584e4'
const WARNING_FALLBACK = '#e5a50a'
/** Ring thickness, in drawn pixels — the same weight the sheet rings a pick with. */
const RING_WIDTH = 2
/** Dash and gap length of a borrowed cell's ring, in drawn pixels. */
const DASH = 3

export interface TerrainSampleSignals extends Gtk.Widget.SignalSignatures {
  /** A cell of the shape was tapped, by row-major index. See {@link TerrainSample.setInteractive}. */
  'cell-activated': (index: number) => void
}

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
 * unit-tested where it lives. The fix-up page (§5.3) makes it tappable
 * too, and that stays a pure view as well — it reports WHICH CELL was
 * tapped and draws the rings it is given; which piece that is, and
 * which other cells share it, is the dialog's model.
 */
export class TerrainSample extends Gtk.Widget {
  private _tiles: (Gdk.Paintable | null)[] = []
  private _floor: Gdk.Paintable | null = null
  private _tilePx = 16
  /** Cells ringed solid — the piece a tap picked out. */
  private _selected: number[] = []
  /** Cells ringed dashed — pieces the table only borrowed. */
  private _dashed: number[] = []
  private _signals = new SignalScope()
  private _click: Gtk.GestureClick | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTerrainSample',
        Signals: { 'cell-activated': { param_types: [GObject.TYPE_INT] } },
      },
      TerrainSample,
    )
  }

  declare connect: GObject.SignalMethods<this, TerrainSampleSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TerrainSampleSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TerrainSampleSignals>['emit']

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

  /**
   * Ring `selected` solid and `dashed` with a broken line — the piece a
   * tap picked out, and the pieces that are only borrowed (§5.3).
   *
   * Two lists rather than one state per cell, because they overlap: a
   * borrowed piece is the one most worth selecting, and it has to stay
   * legible as borrowed while it is the subject.
   */
  setMarks(selected: readonly number[], dashed: readonly number[]): void {
    this._selected = [...selected]
    this._dashed = [...dashed]
    this.queue_draw()
  }

  /**
   * Report taps as `cell-activated`.
   *
   * Off by default: the place page's sample is a picture of a result,
   * and a cell there has nothing to say — the piece under it is decided
   * by where the frame sits, not by the sample.
   */
  setInteractive(interactive: boolean): void {
    if (interactive) this._ensureClickGesture().set_propagation_phase(Gtk.PropagationPhase.BUBBLE)
    else this._click?.set_propagation_phase(Gtk.PropagationPhase.NONE)
  }

  vfunc_map(): void {
    super.vfunc_map()
    const click = this._click
    if (click) this._signals.connect(click, 'pressed', (_g, _n: number, x: number, y: number) => this._tapped(x, y))
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Created once and kept, its phase switched by {@link setInteractive};
   * `vfunc_unmap` releases the handlers, not the controller (the pattern
   * of {@link AtlasCanvas}).
   */
  private _ensureClickGesture(): Gtk.GestureClick {
    if (this._click) return this._click
    const click = new Gtk.GestureClick({ button: Gdk.BUTTON_PRIMARY })
    this.add_controller(click)
    this._click = click
    // Mapped already when the host turns interaction on — connect now,
    // because `vfunc_map` has been and gone.
    if (this.get_mapped()) {
      this._signals.connect(click, 'pressed', (_g, _n: number, x: number, y: number) => this._tapped(x, y))
    }
    return click
  }

  private _tapped(x: number, y: number): void {
    const index = terrainGridCellAt(this._fit(), TERRAIN_SAMPLE_COLUMNS, TERRAIN_SAMPLE_ROWS, x, y)
    if (index != null) this.emit('cell-activated', index)
  }

  private _fit() {
    return fitTerrainGrid(
      this.get_width(),
      this.get_height(),
      this._tilePx,
      TERRAIN_SAMPLE_COLUMNS,
      TERRAIN_SAMPLE_ROWS,
    )
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
    const fit = this._fit()
    if (!fit) return
    for (let index = 0; index < TERRAIN_SAMPLE_COLUMNS * TERRAIN_SAMPLE_ROWS; index++) {
      const x = fit.x + (index % TERRAIN_SAMPLE_COLUMNS) * fit.cell
      const y = fit.y + Math.floor(index / TERRAIN_SAMPLE_COLUMNS) * fit.cell
      this._paint(snapshot, this._floor, x, y, fit.cell)
      this._paint(snapshot, this._tiles[index] ?? null, x, y, fit.cell)
    }
    // Over every tile, not per cell: a ring drawn before its neighbour's
    // tile would be half covered where the cells touch.
    const warning = this._namedColor('warning_color', WARNING_FALLBACK)
    for (const index of this._dashed) this._ringCell(snapshot, fit, index, warning, true)
    const accent = this._namedColor('accent_bg_color', ACCENT_FALLBACK)
    for (const index of this._selected) this._ringCell(snapshot, fit, index, accent, false)
  }

  private _ringCell(
    snapshot: Gtk.Snapshot,
    fit: { cell: number; x: number; y: number },
    index: number,
    color: Gdk.RGBA,
    dashed: boolean,
  ): void {
    if (index < 0 || index >= TERRAIN_SAMPLE_COLUMNS * TERRAIN_SAMPLE_ROWS) return
    const x = fit.x + (index % TERRAIN_SAMPLE_COLUMNS) * fit.cell
    const y = fit.y + Math.floor(index / TERRAIN_SAMPLE_COLUMNS) * fit.cell
    const width = Math.min(RING_WIDTH, Math.max(1, Math.floor(fit.cell / 4)))
    if (!dashed) {
      this._bar(snapshot, color, x, y, fit.cell, width)
      this._bar(snapshot, color, x, y + fit.cell - width, fit.cell, width)
      this._bar(snapshot, color, x, y, width, fit.cell)
      this._bar(snapshot, color, x + fit.cell - width, y, width, fit.cell)
      return
    }
    // Dashes laid by hand: `append_border` has no stroke pattern, and
    // the distinction a dash carries here — "this piece is borrowed, the
    // table never named it" — is the one thing this page exists to show.
    for (let at = 0; at < fit.cell; at += DASH * 2) {
      const run = Math.min(DASH, fit.cell - at)
      this._bar(snapshot, color, x + at, y, run, width)
      this._bar(snapshot, color, x + at, y + fit.cell - width, run, width)
      this._bar(snapshot, color, x, y + at, width, run)
      this._bar(snapshot, color, x + fit.cell - width, y + at, width, run)
    }
  }

  private _bar(snapshot: Gtk.Snapshot, color: Gdk.RGBA, x: number, y: number, width: number, height: number): void {
    const rect = new Graphene.Rect()
    rect.init(x, y, width, height)
    snapshot.append_color(color, rect)
  }

  private _namedColor(name: string, fallback: string): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color(name)
      if (found) return color
    } catch {
      // GTK4 deprecation may turn lookup_color into a no-op; fall back.
    }
    const rgba = new Gdk.RGBA()
    rgba.parse(fallback)
    return rgba
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
