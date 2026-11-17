import { describe, expect, it } from '@gjsify/unit'
import { TerrainPreset } from '@pixelrpg/engine'

import {
  clampToSheet,
  movePart,
  nextBrushName,
  nudgeActivePart,
  partSpans,
  placeActivePart,
  placementFrames,
  placementFromLayout,
  placementLayout,
  placementProblems,
  placementSpriteIds,
  placementTiles,
  setActivePart,
  startPlacement,
  terrainIdFor,
} from './terrain-define-dialog.model.ts'

/** This pack's sheet: 57 × 31 cells of 16 px (TERRAIN.md § 2). */
const SHEET = { columns: 57, rows: 31 }

const spanOf = (state: ReturnType<typeof startPlacement>, part: string) =>
  partSpans(state).find((span) => span.part === part)

const at = (state: ReturnType<typeof startPlacement>, part: string) =>
  `${state.parts[part]?.col},${state.parts[part]?.row}`

export default async () => {
  await describe('startPlacement', async () => {
    await it('drops a one-part preset in the corner', async () => {
      const state = startPlacement(TerrainPreset.Ground29, SHEET)
      expect(at(state, 'block')).toBe('0,0')
      expect(state.activePart).toBe('block')
    })

    await it('leaves room for a part that sits LEFT of the first one', async () => {
      // patch-13's corners are two columns left of its block, so a block
      // at column 0 would open the dialog already broken.
      const state = startPlacement(TerrainPreset.Patch13, SHEET)
      expect(at(state, 'corners')).toBe('0,0')
      expect(at(state, 'block')).toBe('2,0')
      expect(placementProblems(state, SHEET).length).toBe(0)
    })

    await it('says nothing about a preset it does not know', async () => {
      const state = startPlacement('made-up' as TerrainPreset, SHEET)
      expect(partSpans(state).length).toBe(0)
      expect(state.activePart).toBe('')
    })
  })

  await describe('moving parts', async () => {
    await it('carries the whole arrangement when the first part moves', async () => {
      const state = placeActivePart(startPlacement(TerrainPreset.Patch13, SHEET), 10, 5)
      expect(at(state, 'block')).toBe('10,5')
      // The corners kept their offset rather than being left behind.
      expect(at(state, 'corners')).toBe('8,5')
    })

    await it('moves a later part on its own — the "corners a row lower" fix', async () => {
      const start = placeActivePart(startPlacement(TerrainPreset.Patch13, SHEET), 10, 5)
      const state = nudgeActivePart(setActivePart(start, 'corners'), 0, 1)
      expect(at(state, 'corners')).toBe('8,6')
      expect(at(state, 'block')).toBe('10,5')
    })

    await it('ignores a part the preset does not have', async () => {
      const start = startPlacement(TerrainPreset.Block9, SHEET)
      expect(setActivePart(start, 'corners').activePart).toBe('block')
      expect(at(movePart(start, 'corners', 3, 3), 'block')).toBe('0,0')
    })

    await it('taps land the ACTIVE part, not the first one', async () => {
      const start = setActivePart(startPlacement(TerrainPreset.Patch13, SHEET), 'corners')
      const state = placeActivePart(start, 20, 9)
      expect(at(state, 'corners')).toBe('20,9')
      expect(at(state, 'block')).toBe('2,0')
    })
  })

  await describe('clampToSheet', async () => {
    await it('pulls a block back inside a sheet it hangs off', async () => {
      const state = clampToSheet(placeActivePart(startPlacement(TerrainPreset.Block9, SHEET), 56, 30), SHEET)
      expect(at(state, 'block')).toBe('54,28')
    })

    await it('gives up gracefully on a sheet smaller than the preset', async () => {
      const tiny = { columns: 2, rows: 2 }
      const state = clampToSheet(startPlacement(TerrainPreset.Block9, tiny), tiny)
      expect(at(state, 'block')).toBe('0,0')
    })
  })

  await describe('placementProblems', async () => {
    await it('is empty for a block that fits', async () => {
      const state = placeActivePart(startPlacement(TerrainPreset.Ground29, SHEET), 5, 7)
      expect(placementProblems(state, SHEET).length).toBe(0)
    })

    await it('reports a part that runs off the edge', async () => {
      const state = movePart(startPlacement(TerrainPreset.Block9, SHEET), 'block', 55, 0)
      const problems = placementProblems(state, SHEET)
      expect(problems.length).toBe(1)
      expect(`${problems[0].kind} ${problems[0].part}`).toBe('off-sheet block')
    })

    await it('reports two parts of the same preset on the same cells', async () => {
      const start = startPlacement(TerrainPreset.Patch13, SHEET)
      const state = movePart(start, 'corners', 3, 0)
      const problems = placementProblems(state, SHEET)
      expect(problems.length).toBe(1)
      expect(problems[0].kind).toBe('overlap')
    })
  })

  await describe('placementFrames', async () => {
    await it('marks the active part, dims the rest', async () => {
      const state = startPlacement(TerrainPreset.Patch13, SHEET)
      expect(
        placementFrames(state, SHEET)
          .map((frame) => frame.tone)
          .join(' '),
      ).toBe('active idle')
    })

    await it('turns a broken part red, active or not', async () => {
      const state = movePart(startPlacement(TerrainPreset.Patch13, SHEET), 'corners', -3, 0)
      expect(
        placementFrames(state, SHEET)
          .map((frame) => frame.tone)
          .join(' '),
      ).toBe('active error')
    })

    await it('frames the parts where they actually sit', async () => {
      const state = placeActivePart(startPlacement(TerrainPreset.Patch13, SHEET), 10, 5)
      const frame = placementFrames(state, SHEET)[0]
      expect(`${frame.span.col},${frame.span.row} ${frame.span.columns}×${frame.span.rows}`).toBe('10,5 3×3')
    })
  })

  await describe('what the placement writes', async () => {
    await it('fills the table each preset is named for', async () => {
      const tiles = (preset: TerrainPreset) =>
        Object.keys(placementTiles(placeActivePart(startPlacement(preset, SHEET), 5, 7), SHEET)).length
      expect(tiles(TerrainPreset.Ground29)).toBe(29)
      expect(tiles(TerrainPreset.Patch13)).toBe(13)
      expect(tiles(TerrainPreset.Block9)).toBe(9)
    })

    await it("reproduces the shipped path brush's table", async () => {
      // §2.1's measured position: ground-29 at column 5, row 7.
      const state = placeActivePart(startPlacement(TerrainPreset.Ground29, SHEET), 5, 7)
      const tiles = placementTiles(state, SHEET)
      // Top-left of the block is the "path end, open north" piece.
      expect(tiles['84']).toBe(7 * 57 + 5)
      // The filled centre, three rows down and three columns across.
      expect(tiles['255']).toBe(10 * 57 + 8)
    })

    await it('covers every cell of every part, empty ones included', async () => {
      const state = placeActivePart(startPlacement(TerrainPreset.Ground29, SHEET), 5, 7)
      // 5 × 6 cells, one of which the preset leaves blank — collision is
      // written for the picture, not for the table.
      expect(placementSpriteIds(state, SHEET).length).toBe(30)
      expect(placementSpriteIds(state, SHEET)[0]).toBe(7 * 57 + 5)
    })

    await it('stores the layout the dialog reopens on', async () => {
      const state = placeActivePart(startPlacement(TerrainPreset.Patch13, SHEET), 10, 5)
      const layout = placementLayout(state)
      const back = placementFromLayout(layout)
      expect(`${at(back, 'block')} ${at(back, 'corners')}`).toBe('10,5 8,5')
      expect(back.activePart).toBe('block')
    })

    await it('fills in a part an older layout never stored', async () => {
      const back = placementFromLayout({
        preset: TerrainPreset.Patch13,
        parts: { block: { col: 10, row: 5 } },
      })
      expect(at(back, 'corners')).toBe('8,5')
      expect(spanOf(back, 'corners')?.columns).toBe(2)
    })
  })

  await describe('naming a new brush', async () => {
    await it('numbers a name the set already has', async () => {
      expect(nextBrushName([], 'Brush')).toBe('Brush')
      expect(nextBrushName(['Brush'], 'Brush')).toBe('Brush 2')
      expect(nextBrushName(['Brush', 'Brush 2'], 'Brush')).toBe('Brush 3')
      // Case and stray spaces are the same name to a reader.
      expect(nextBrushName([' brush '], 'Brush')).toBe('Brush 2')
    })

    await it('derives an id from the name and keeps it unique', async () => {
      expect(terrainIdFor('Deep Water', [])).toBe('deep-water')
      expect(terrainIdFor('Deep Water', ['deep-water'])).toBe('deep-water-2')
      // A name with nothing id-able left still yields an addressable brush.
      expect(terrainIdFor('🌊', [])).toBe('terrain')
      expect(terrainIdFor('  ', ['terrain'])).toBe('terrain-2')
    })
  })
}
