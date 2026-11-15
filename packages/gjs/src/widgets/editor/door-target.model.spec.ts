import { describe, expect, it } from '@gjsify/unit'

import {
  doorTargetState,
  type MapBounds,
  oppositeFacing,
  planDoorBack,
  readDoorTeleport,
  withDoorTarget,
  withDoorTargetComponents,
} from './door-target.model.ts'

const BIG: MapBounds = { columns: 100, rows: 100 }

export default async function doorTargetModelSuite(): Promise<void> {
  await describe('readDoorTeleport', async () => {
    await it('finds the teleport component and ignores the rest', async () => {
      const teleport = readDoorTeleport([
        { type: 'trigger', on: 'walk-onto' },
        { type: 'teleport', targetMapId: 'tree-house', targetTileX: 10, targetTileY: 12, facing: 'up' },
      ])
      expect(teleport?.targetMapId).toBe('tree-house')
      expect(teleport?.targetTileX).toBe(10)
      expect(teleport?.facing).toBe('up')
    })

    /** This `null` is what tells the Selected page not to show a "Goes to" row at all. */
    await it('is null for a placement that is not a door', async () => {
      expect(readDoorTeleport([{ type: 'trigger', on: 'walk-onto' }])).toBe(null)
      expect(readDoorTeleport(undefined)).toBe(null)
    })
  })

  await describe('doorTargetState', async () => {
    const maps = new Map([
      ['tree-house', "Link's Tree House"],
      ['kokiri-forest', 'Kokiri Forest'],
    ])

    await it('resolves a complete target to the map NAME', async () => {
      const state = doorTargetState({ targetMapId: 'tree-house', targetTileX: 10, targetTileY: 12 }, maps)
      expect(state.kind).toBe('set')
      if (state.kind !== 'set') return
      expect(state.mapName).toBe("Link's Tree House")
      expect(state.tile).toStrictEqual({ x: 10, y: 12 })
    })

    await it('is unset for a fresh door and for one with no arrival tile', async () => {
      expect(doorTargetState(null, maps).kind).toBe('unset')
      expect(doorTargetState({}, maps).kind).toBe('unset')
      // Names a map but puts the hero nowhere on it — the same case
      // `collectAtlasTeleports` nulls for the atlas.
      expect(doorTargetState({ targetMapId: 'tree-house' }, maps).kind).toBe('unset')
    })

    /**
     * A target naming a map the project no longer has must read
     * differently from one naming no map: it is a data error the user
     * cannot see from the map itself, and "Nowhere yet" would hide it.
     */
    await it('is broken, not unset, when the named map is gone', async () => {
      const state = doorTargetState({ targetMapId: 'deleted-cave', targetTileX: 1, targetTileY: 1 }, maps)
      expect(state.kind).toBe('broken')
      if (state.kind !== 'broken') return
      expect(state.targetMapId).toBe('deleted-cave')
    })
  })

  await describe('withDoorTarget', async () => {
    await it('writes the pick and keeps what the picker never asked', async () => {
      const next = withDoorTarget(
        { targetMapId: 'old-map', targetTileX: 1, targetTileY: 2, facing: 'left', label: 'Back door' },
        'tree-house',
        { x: 10, y: 12 },
      )
      expect(next.type).toBe('teleport')
      expect(next.targetMapId).toBe('tree-house')
      expect(next.targetTileX).toBe(10)
      expect(next.targetTileY).toBe(12)
      // Hand-authored answers the flow has no UI for survive a re-point.
      expect(next.facing).toBe('left')
      expect(next.label).toBe('Back door')
    })

    await it('builds a complete teleport for a door that had none', async () => {
      const next = withDoorTarget(null, 'tree-house', { x: 3, y: 4 })
      expect(next).toStrictEqual({ type: 'teleport', targetMapId: 'tree-house', targetTileX: 3, targetTileY: 4 })
    })
  })

  await describe('withDoorTargetComponents', async () => {
    const teleport = { type: 'teleport' as const, targetMapId: 'tree-house', targetTileX: 1, targetTileY: 2 }

    await it('replaces the teleport in place and keeps the rest', async () => {
      const next = withDoorTargetComponents(
        [
          { type: 'sprite', spriteSetId: 'overworld' },
          { type: 'teleport', targetMapId: 'kokiri-forest' },
          { type: 'trigger', on: 'walk-onto' },
        ],
        teleport,
      )
      expect(next.map((component) => component.type)).toStrictEqual(['sprite', 'teleport', 'trigger'])
      expect(next[1]).toStrictEqual(teleport)
      // What makes the door back look like a door: its sprite survives.
      expect(next[0]).toStrictEqual({ type: 'sprite', spriteSetId: 'overworld' })
    })

    await it('appends to a definition that carried no teleport', async () => {
      expect(withDoorTargetComponents([{ type: 'sprite' }], teleport)).toStrictEqual([{ type: 'sprite' }, teleport])
      expect(withDoorTargetComponents(undefined, teleport)).toStrictEqual([teleport])
    })
  })

  await describe('planDoorBack', async () => {
    await it('is the inverse of the facing', async () => {
      expect(oppositeFacing('up')).toBe('down')
      expect(oppositeFacing('down')).toBe('up')
      expect(oppositeFacing('left')).toBe('right')
      expect(oppositeFacing('right')).toBe('left')
    })

    /**
     * The sample project's own Kokiri Forest ↔ tree house pair, which is
     * the geometry this function has to reproduce: door at (76, 67)
     * arriving facing `up` at (10, 12), return door at (10, 13) pointing
     * back at (76, 68).
     */
    await it('reproduces the sample project authoring', async () => {
      const plan = planDoorBack({
        sourceTile: { x: 76, y: 67 },
        sourceBounds: BIG,
        arrivalTile: { x: 10, y: 12 },
        arrivalBounds: BIG,
        facing: 'up',
      })
      expect(plan.placeAt).toStrictEqual({ x: 10, y: 13 })
      expect(plan.targetTile).toStrictEqual({ x: 76, y: 68 })
      expect(plan.facing).toBe('down')
    })

    /**
     * The whole reason this is not § 6.2's literal "on the target tile":
     * a return door on the arrival tile is a walk-onto trigger the hero
     * materialises standing on, and the pair would bounce them forever.
     */
    await it('never puts the return door on the arrival tile', async () => {
      for (const facing of ['up', 'down', 'left', 'right'] as const) {
        const plan = planDoorBack({
          sourceTile: { x: 5, y: 5 },
          sourceBounds: BIG,
          arrivalTile: { x: 9, y: 9 },
          arrivalBounds: BIG,
          facing,
        })
        expect(plan.placeAt).not.toStrictEqual({ x: 9, y: 9 })
        expect(plan.targetTile).not.toStrictEqual({ x: 5, y: 5 })
      }
    })

    await it('mirrors the step rather than leaving the map', async () => {
      // Arrival on the bottom row: stepping `down` would fall off, so
      // the return door goes above it instead.
      const plan = planDoorBack({
        sourceTile: { x: 0, y: 0 },
        sourceBounds: { columns: 4, rows: 4 },
        arrivalTile: { x: 2, y: 3 },
        arrivalBounds: { columns: 4, rows: 4 },
        facing: 'up',
      })
      expect(plan.placeAt).toStrictEqual({ x: 2, y: 2 })
      // The source door is on the top row, where `down` is fine.
      expect(plan.targetTile).toStrictEqual({ x: 0, y: 1 })
    })

    await it('falls back to the tile itself on a one-row map', async () => {
      const plan = planDoorBack({
        sourceTile: { x: 1, y: 0 },
        sourceBounds: { columns: 4, rows: 1 },
        arrivalTile: { x: 2, y: 0 },
        arrivalBounds: { columns: 4, rows: 1 },
        facing: 'up',
      })
      expect(plan.placeAt).toStrictEqual({ x: 2, y: 0 })
      expect(plan.targetTile).toStrictEqual({ x: 1, y: 0 })
    })

    await it('defaults a door with no facing to a return door above the arrival', async () => {
      const plan = planDoorBack({
        sourceTile: { x: 5, y: 5 },
        sourceBounds: BIG,
        arrivalTile: { x: 9, y: 9 },
        arrivalBounds: BIG,
      })
      expect(plan.facing).toBe('up')
      expect(plan.placeAt).toStrictEqual({ x: 9, y: 8 })
      expect(plan.targetTile).toStrictEqual({ x: 5, y: 4 })
    })
  })
}
