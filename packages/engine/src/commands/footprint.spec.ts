/**
 * `Command.footprint()` across the whole registry.
 *
 * The receive-side edit flash (`services/peer-edit-flash.ts`) asks a
 * command where it landed instead of switching on `kind`. That only
 * stays honest if the set of commands answering the question is
 * checked against the registry itself — otherwise a seventh tile
 * command lands one day with no footprint and attributes nothing,
 * silently and only in a shared session.
 */

import { describe, expect, it } from '@gjsify/unit'

import { PlaceObjectCommand, RemoveObjectCommand } from './object-placement.command.ts'
import { EraseTileCommand, FillTileCommand, PaintCellsCommand, PaintTileCommand } from './paint-tile.command.ts'
import { BUILT_IN_COMMANDS } from './registry.ts'

/**
 * One payload wide enough for every registered factory — the command
 * constructors only store it, so the unused fields cost nothing and the
 * iteration below needs no per-kind table.
 */
const payload = {
  layerId: 'ground',
  tileX: 2,
  tileY: 3,
  spriteId: 12,
  previousSprites: [],
  cells: [
    { tileX: 2, tileY: 3, previousSprites: [] },
    { tileX: 4, tileY: 5, previousSprites: [] },
  ],
  placement: { id: 'p1', entityId: 'tree', layerId: 'objects', tileX: 7, tileY: 8 },
  name: 'Ground',
  previousName: 'Layer 1',
  visible: true,
  locked: true,
  index: 0,
  previousIndex: 1,
  plane: 'base',
  previousPlane: 'overlay',
  layer: { id: 'ground', name: 'Ground' },
}

/** The commands that touch tiles, and are therefore pointable-at. */
const KINDS_WITH_FOOTPRINT = [
  PaintTileCommand.KIND,
  EraseTileCommand.KIND,
  FillTileCommand.KIND,
  PaintCellsCommand.KIND,
  PlaceObjectCommand.KIND,
  RemoveObjectCommand.KIND,
]

export default async () => {
  await describe('Command.footprint', async () => {
    await it('is implemented by exactly the tile- and object-level commands', async () => {
      const withFootprint = Object.entries(BUILT_IN_COMMANDS)
        .filter(([, factory]) => typeof factory(payload).footprint === 'function')
        .map(([kind]) => kind)
        .sort()
      expect(withFootprint).toStrictEqual([...KINDS_WITH_FOOTPRINT].sort())
    })

    await it('leaves layer-level commands without one', async () => {
      // Renaming a layer or reordering planes changes no tiles, so there
      // is nothing to outline. Absent, not empty — the flash never runs.
      const layerKinds = Object.keys(BUILT_IN_COMMANDS).filter((kind) => !KINDS_WITH_FOOTPRINT.includes(kind))
      expect(layerKinds.length).toBe(8)
      for (const kind of layerKinds) {
        expect(BUILT_IN_COMMANDS[kind]!(payload).footprint).toBe(undefined)
      }
    })

    await it('reports the single painted cell', async () => {
      const command = new PaintTileCommand({ layerId: 'ground', tileX: 2, tileY: 3, spriteId: 12, previousSprites: [] })
      expect(command.footprint()).toStrictEqual({ layerId: 'ground', tiles: [{ tileX: 2, tileY: 3 }] })
    })

    await it('reports the erased cell', async () => {
      const command = new EraseTileCommand({ layerId: 'ground', tileX: 9, tileY: 1, previousSprites: [] })
      expect(command.footprint()).toStrictEqual({ layerId: 'ground', tiles: [{ tileX: 9, tileY: 1 }] })
    })

    await it('reports every cell of a fill', async () => {
      const command = new FillTileCommand({
        layerId: 'water',
        spriteId: 4,
        cells: [
          { tileX: 0, tileY: 0, previousSprites: [] },
          { tileX: 1, tileY: 0, previousSprites: [] },
        ],
      })
      expect(command.footprint()).toStrictEqual({
        layerId: 'water',
        tiles: [
          { tileX: 0, tileY: 0 },
          { tileX: 1, tileY: 0 },
        ],
      })
    })

    await it("reports a placement's own cell, on the placement's layer", async () => {
      // Not `payload.layerId` — an object placement carries its layer
      // inside the placement, and the two are not the same field.
      const placement = { id: 'p1', entityId: 'tree', layerId: 'objects', tileX: 7, tileY: 8 }
      const placed = BUILT_IN_COMMANDS[PlaceObjectCommand.KIND]!({ placement })
      const removed = BUILT_IN_COMMANDS[RemoveObjectCommand.KIND]!({ placement })
      const expected = { layerId: 'objects', tiles: [{ tileX: 7, tileY: 8 }] }
      expect(placed.footprint?.()).toStrictEqual(expected)
      expect(removed.footprint?.()).toStrictEqual(expected)
    })
  })
}
