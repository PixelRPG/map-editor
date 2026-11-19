import { describe, expect, it } from '@gjsify/unit'
import { TerrainPreset } from '@pixelrpg/engine'

import {
  assignPiece,
  cellsUsingPiece,
  clampToSheet,
  fixupCells,
  missingCells,
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
  toggleTerrainMember,
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

  await describe('the fix-up page', async () => {
    /** A full `ground-29` table, as the place page would have written it. */
    const full = placementTiles(startPlacement(TerrainPreset.Ground29, SHEET), SHEET)

    await it('resolves one entry per sample cell', async () => {
      const cells = fixupCells(full)
      expect(cells.length).toBe(140)
      expect(cells.filter((cell) => cell.mask == null).length).toBe(
        cells.filter((cell) => cell.spriteId == null).length,
      )
    })

    await it('marks a borrowed piece as inexact', async () => {
      // One entry for the filled centre: every other cell of the shape
      // can only borrow it, and none of them is the author's choice.
      const cells = fixupCells({ '255': 42 })
      const placed = cells.filter((cell) => cell.exact)
      expect(placed.length).toBe(cells.filter((cell) => cell.mask === 255).length)
      expect(missingCells(cells).length).toBe(cells.filter((cell) => cell.mask != null).length - placed.length)
    })

    await it('has nothing missing once the preset filled the table', async () => {
      // `ground-29` is what the starter ships; if its own sample came up
      // dashed, the page would be shouting about a brush that is fine.
      expect(missingCells(fixupCells(full)).length).toBe(0)
    })

    await it('selects every cell asking for the same piece', async () => {
      const cells = fixupCells(full)
      // A piece more than one cell wants — the ring's edges repeat, and
      // all of them have to light up together, because one tap on the
      // sheet changes the single table row they share.
      const counts = new Map<number, number>()
      for (const cell of cells) if (cell.mask != null) counts.set(cell.mask, (counts.get(cell.mask) ?? 0) + 1)
      const shared = [...counts.entries()].find(([, seen]) => seen > 1)
      expect(shared != null).toBe(true)
      const mask = shared?.[0] ?? -1
      const selected = cellsUsingPiece(
        cells,
        cells.findIndex((cell) => cell.mask === mask),
      )
      expect(selected.length).toBe(shared?.[1] ?? 0)
      expect(selected.filter((index) => cells[index]?.mask !== mask).length).toBe(0)
    })

    await it('does not pull in a cell that merely borrowed the same tile', async () => {
      // One entry: every cell of the shape DRAWS sprite 42, but a tap
      // changes one row of the table, so one mask is what highlights.
      const cells = fixupCells({ '255': 42 })
      const end = cells.findIndex((cell) => cell.mask === 4)
      const selected = cellsUsingPiece(cells, end)
      expect(selected.length).toBe(cells.filter((cell) => cell.mask === 4).length)
      expect(selected.length < cells.filter((cell) => cell.spriteId === 42).length).toBe(true)
    })

    await it('selects nothing on bare floor or off the shape', async () => {
      const cells = fixupCells(full)
      const floor = cells.findIndex((cell) => cell.mask == null)
      expect(cellsUsingPiece(cells, floor).length).toBe(0)
      expect(cellsUsingPiece(cells, 9999).length).toBe(0)
    })

    await it('still selects a piece an empty table draws nothing for', async () => {
      // Tile by tile starts here: nothing is drawn anywhere, and the
      // only way to fill the first row is to tap the cell that wants it.
      const empty = fixupCells({})
      const first = empty.findIndex((cell) => cell.mask != null)
      const selected = cellsUsingPiece(empty, first)
      expect(selected.includes(first)).toBe(true)
      expect(selected.length).toBe(empty.filter((cell) => cell.mask === empty[first]?.mask).length)
    })

    await it('adds the entry a borrowed piece never had', async () => {
      const assigned = assignPiece({ '255': 42 }, 4, 7)
      expect(assigned['4']).toBe(7)
      expect(assigned['255']).toBe(42)
      expect(fixupCells(assigned).filter((cell) => cell.mask === 4 && cell.exact).length > 0).toBe(true)
    })

    await it('refuses a mask the resolver would drop', async () => {
      // 3 is N|NE — a diagonal without both its sides, which
      // `normaliseTerrainMask` clears. Written, it would sit in the
      // file doing nothing.
      expect(assignPiece({}, 3, 7)['3']).toBe(undefined)
      expect(assignPiece({}, 256, 7)['256']).toBe(undefined)
      expect(assignPiece({}, 4, -1)['4']).toBe(undefined)
    })

    await it('leaves the table it was given alone', async () => {
      const before = { '255': 42 }
      assignPiece(before, 4, 7)
      expect(Object.keys(before).join(' ')).toBe('255')
    })
  })

  await describe('also counts as this', async () => {
    await it('adds and removes the same tap', async () => {
      expect(toggleTerrainMember([], 5).join(' ')).toBe('5')
      expect(toggleTerrainMember([5], 5).join(' ')).toBe('')
    })

    await it('keeps the list sorted whatever order it was filled in', async () => {
      expect(toggleTerrainMember(toggleTerrainMember([], 9), 4).join(' ')).toBe('4 9')
      expect(toggleTerrainMember(toggleTerrainMember([], 4), 9).join(' ')).toBe('4 9')
    })

    await it('ignores a sprite id that is not one', async () => {
      expect(toggleTerrainMember([4], -1).join(' ')).toBe('4')
      expect(toggleTerrainMember([4], 1.5).join(' ')).toBe('4')
    })
  })
}
