/**
 * The bucket with a TERRAIN armed: which cells it may be anchored at,
 * and that the hover and the click read the same answer.
 *
 * Three ways this fails silently, one per property below:
 *
 *  1. **Spilling.** A 2×2 patch brush anchored at the region's edge
 *     paints two cells OUTSIDE the shape the user clicked. Nothing
 *     errors — the map simply grows a pond that runs past the clearing
 *     (TERRAIN.md §6.2), and the undo step takes the spill with it, so
 *     it only shows up when someone looks.
 *  2. **A hole in the middle of a fill.** Anchoring only where the
 *     footprint fits is the fix for (1), but a fill that anchors at
 *     too few cells leaves parts of the region unpainted. The brush
 *     has to cover the region exactly: every cell of it, no cell
 *     beyond it.
 *  3. **Preview / click drift.** The outline the hover draws and the
 *     cells the click writes come from {@link resolveTerrainFillRegion}
 *     precisely so they cannot disagree. A test that only checks the
 *     click would let the two drift the moment one of them grows a
 *     special case — so the region the hover would outline is asserted
 *     against what the committed fill actually covers.
 *
 * Plus the refusals: a region narrower than the brush (no anchor
 * anywhere), a fill over what is already there, and a brush the map's
 * sprite sets don't define.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { PaintCellsCommand } from '../commands/index.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { terrainTilesForPreset } from '../resource/terrain-presets.ts'
import type { TerrainAddress, TerrainBounds } from '../resource/terrain.ts'
import { TerrainPreset } from '../types/data/TerrainData.ts'
import type { TerrainData } from '../types/data/index.ts'
import { getSpritesAt, setSpritesAt } from './map-editor-shadow.service.ts'
import { buildTerrainFillCommand, resolveTerrainFillRegion } from './tile-fill.service.ts'

const LAYER = 'ground-layer'
const SET = 'pack'
/** Wide enough that the two terrains below occupy disjoint columns. */
const SHEET = { columns: 20 }
const BOUNDS: TerrainBounds = { columns: 6, rows: 6 }

/** `ground-29` — has a mask-0 piece, so its footprint is one cell. */
const PATH: TerrainData = {
  id: 'path',
  name: 'Path',
  tiles: terrainTilesForPreset(TerrainPreset.Ground29, { block: { col: 0, row: 0 } }, SHEET),
}

/** `patch-13` — no mask-0 entry, so the brush is 2×2 and cannot fit everywhere. */
const POND: TerrainData = {
  id: 'pond',
  name: 'Pond',
  tiles: terrainTilesForPreset(
    TerrainPreset.Patch13,
    { block: { col: 7, row: 0 }, corners: { col: 5, row: 0 } },
    SHEET,
  ),
}

/** A sprite belonging to no terrain — the material that bounds a region. */
const GRASS = { spriteSetId: SET, spriteId: 300 }

/** Only the catalogue is read off the map here, so that is all the stub carries. */
const MAP_RESOURCE = {
  getAllSpriteSetResources: () => new Map([[SET, { data: { terrains: [PATH, POND] } }]]),
} as unknown as MapResource

function address(terrainId: string): TerrainAddress {
  return { spriteSetId: SET, terrainId }
}

/** The sprite id `terrain` uses for `mask`, asserted to exist in its table. */
function tileFor(terrain: TerrainData, mask: number): number {
  const id = terrain.tiles[String(mask)]
  if (id === undefined) throw new Error(`fixture terrain ${terrain.id} has no tile for mask ${mask}`)
  return id
}

/** Every cell of the rectangle, row-major — the shape a test leaves open. */
function block(x0: number, y0: number, columns: number, rows: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  for (let y = y0; y < y0 + rows; y++) {
    for (let x = x0; x < x0 + columns; x++) cells.push({ x, y })
  }
  return cells
}

function key(cell: { x: number; y: number }): string {
  return `${cell.x},${cell.y}`
}

/** Sorted `"x,y"` keys — the comparable form of a cell set, order-independent. */
function keys(cells: ReadonlyArray<{ x: number; y: number }>): string[] {
  return cells.map(key).sort()
}

/**
 * An editor whose every cell holds grass except `open`, which is left
 * empty: a clearing of that exact shape, and the only region a click
 * landing inside it can flood.
 */
function makeEditor(open: ReadonlyArray<{ x: number; y: number }>): MapEditorComponent {
  const editor = new MapEditorComponent()
  const clearing = new Set(open.map(key))
  for (let y = 0; y < BOUNDS.rows; y++) {
    for (let x = 0; x < BOUNDS.columns; x++) {
      if (!clearing.has(`${x},${y}`)) setSpritesAt(editor, x, y, LAYER, [GRASS])
    }
  }
  return editor
}

/** Write a built command into the shadow, the way `PaintCellsCommand.apply` does. */
function commit(editor: MapEditorComponent, command: PaintCellsCommand): void {
  for (const cell of command.payload.cells) setSpritesAt(editor, cell.tileX, cell.tileY, LAYER, cell.sprites)
}

/** The cells holding a member of `terrain` — what the fill actually covered. */
function cellsOf(editor: MapEditorComponent, terrain: TerrainData): Array<{ x: number; y: number }> {
  const members = new Set(Object.values(terrain.tiles))
  const found: Array<{ x: number; y: number }> = []
  for (let y = 0; y < BOUNDS.rows; y++) {
    for (let x = 0; x < BOUNDS.columns; x++) {
      if (getSpritesAt(editor, x, y, LAYER).some((ref) => members.has(ref.spriteId))) found.push({ x, y })
    }
  }
  return found
}

function fill(
  editor: MapEditorComponent,
  terrainId: string,
  originX: number,
  originY: number,
): ReturnType<typeof buildTerrainFillCommand> {
  return buildTerrainFillCommand({
    editor,
    mapResource: MAP_RESOURCE,
    bounds: BOUNDS,
    layerId: LAYER,
    originX,
    originY,
    terrain: address(terrainId),
  })
}

export default async function tileFillServiceSuite(): Promise<void> {
  await describe('resolveTerrainFillRegion', async () => {
    await it('anchors a one-cell brush on every cell of the region', async () => {
      const clearing = block(1, 1, 3, 3)
      const filled = resolveTerrainFillRegion(makeEditor(clearing), BOUNDS, LAYER, 2, 2, 1)
      expect(keys(filled?.region ?? [])).toStrictEqual(keys(clearing))
      // A footprint of one fits wherever the region reaches, so the
      // fill is exact and the two lists are the same cells.
      expect(keys(filled?.anchors ?? [])).toStrictEqual(keys(clearing))
    })

    await it('anchors a 2×2 brush only where its whole footprint fits', async () => {
      const clearing = block(1, 1, 3, 3)
      const filled = resolveTerrainFillRegion(makeEditor(clearing), BOUNDS, LAYER, 2, 2, 2)
      expect(keys(filled?.region ?? [])).toStrictEqual(keys(clearing))
      // The right column and the bottom row would hang the brush over
      // the region's edge — anchoring there is how a fill spills.
      expect(keys(filled?.anchors ?? [])).toStrictEqual(keys(block(1, 1, 2, 2)))
    })

    await it('refuses a region narrower than the brush', async () => {
      const corridor = block(2, 1, 1, 4)
      const editor = makeEditor(corridor)
      // The shape itself is fine — a one-cell brush fills it…
      expect(keys(resolveTerrainFillRegion(editor, BOUNDS, LAYER, 2, 2, 1)?.anchors ?? [])).toStrictEqual(
        keys(corridor),
      )
      // …but a patch brush has no 1-wide pieces, so there is nothing
      // honest to outline and nothing to paint.
      expect(resolveTerrainFillRegion(editor, BOUNDS, LAYER, 2, 2, 2)).toBeNull()
    })
  })

  await describe('buildTerrainFillCommand', async () => {
    await it('lays a one-cell brush across the region and resolves its interior', async () => {
      const clearing = block(1, 1, 3, 3)
      const editor = makeEditor(clearing)
      const command = fill(editor, 'path', 2, 2)
      if (!command) throw new Error('expected a fill command')
      commit(editor, command)

      expect(keys(cellsOf(editor, PATH))).toStrictEqual(keys(clearing))
      // The middle cell has path on all eight sides: the filled centre,
      // not the lone-tile piece the first tap would have placed.
      expect(getSpritesAt(editor, 2, 2, LAYER).map((ref) => ref.spriteId)).toStrictEqual([tileFor(PATH, 255)])
    })

    await it('fills exactly the region the hover outlines, with a brush wider than one cell', async () => {
      const clearing = block(1, 1, 3, 3)
      const editor = makeEditor(clearing)
      // What the hover would draw, read BEFORE the click changes anything.
      const outlined = resolveTerrainFillRegion(editor, BOUNDS, LAYER, 2, 2, 2)?.region ?? []

      const command = fill(editor, 'pond', 2, 2)
      if (!command) throw new Error('expected a fill command')
      commit(editor, command)

      // Four anchors, each covering 2×2, add up to the 3×3 clearing:
      // no cell left bare, no cell past the grass.
      expect(keys(cellsOf(editor, POND))).toStrictEqual(keys(outlined))
    })

    await it('leaves the material around the region alone', async () => {
      const clearing = block(1, 1, 3, 3)
      const editor = makeEditor(clearing)
      const command = fill(editor, 'pond', 2, 2)
      if (!command) throw new Error('expected a fill command')
      commit(editor, command)

      const inside = new Set(clearing.map(key))
      for (let y = 0; y < BOUNDS.rows; y++) {
        for (let x = 0; x < BOUNDS.columns; x++) {
          if (inside.has(`${x},${y}`)) continue
          expect(getSpritesAt(editor, x, y, LAYER).map((ref) => ref.spriteId)).toStrictEqual([GRASS.spriteId])
        }
      }
    })

    await it('refuses a second fill of the same region', async () => {
      const editor = makeEditor(block(1, 1, 3, 3))
      const first = fill(editor, 'path', 2, 2)
      if (!first) throw new Error('expected a fill command')
      commit(editor, first)
      // Every cell now shows exactly what this brush would place, so
      // the planner has nothing to write and no undo entry is pushed.
      expect(fill(editor, 'path', 2, 2)).toBeNull()
    })

    await it('refuses a brush the map does not define', async () => {
      expect(fill(makeEditor(block(1, 1, 3, 3)), 'lava', 2, 2)).toBeNull()
    })

    await it('refuses a region the brush fits nowhere in', async () => {
      expect(fill(makeEditor(block(2, 1, 1, 4)), 'pond', 2, 2)).toBeNull()
    })
  })
}
