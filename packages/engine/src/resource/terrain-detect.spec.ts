/**
 * "Find brushes": presets recognised from alpha signatures alone.
 *
 * The fixtures are built from the masks, independently of the
 * detector's own expectation table: a cell is opaque at an edge
 * midpoint when the mask has that edge, and at a corner pixel when it
 * has both edges and the diagonal.
 */

import { describe, expect, it } from '@gjsify/unit'

import { TerrainPreset } from '../types/data/index.ts'
import { type TileSignature, findTerrainProposals } from './terrain-detect.ts'
import { defaultTerrainLayout, terrainPresetPlacement } from './terrain-presets.ts'

const SHEET = { columns: 57, rows: 31 }
const BLANK: TileSignature = { bits: 0, blank: true }

function signatureOf(mask: number): TileSignature {
  let bits = mask & (1 | 4 | 16 | 64)
  for (const [corner, edges] of [
    [2, 1 | 4],
    [8, 4 | 16],
    [32, 16 | 64],
    [128, 64 | 1],
  ]) {
    if ((mask & edges) === edges && mask & corner) bits |= corner
  }
  return { bits, blank: false }
}

/** A sheet of blanks with `preset` drawn at `(col, row)`. */
function sheetWith(preset: TerrainPreset, col: number, row: number): TileSignature[] {
  const sheet: TileSignature[] = Array.from({ length: SHEET.columns * SHEET.rows }, () => BLANK)
  const layout = defaultTerrainLayout(preset, col, row)
  for (const cell of terrainPresetPlacement(preset, layout.parts)) {
    sheet[cell.row * SHEET.columns + cell.col] = signatureOf(cell.mask)
  }
  return sheet
}

export default async () => {
  await describe('findTerrainProposals', async () => {
    for (const [preset, col, row] of [
      [TerrainPreset.Ground29, 5, 7],
      [TerrainPreset.Blob47, 10, 3],
      [TerrainPreset.Path16, 20, 12],
      [TerrainPreset.Patch13, 30, 15],
      [TerrainPreset.Block9, 40, 20],
    ] as const) {
      await it(`finds ${preset} where it was drawn, and nothing else`, async () => {
        const found = findTerrainProposals(sheetWith(preset, col, row), SHEET)
        expect(found.length).toBe(1)
        expect(found[0]?.preset).toBe(preset)
        expect(found[0]?.col).toBe(col)
        expect(found[0]?.row).toBe(row)
      })
    }

    await it('finds two groups on one sheet', async () => {
      const sheet = sheetWith(TerrainPreset.Ground29, 5, 7)
      const second = sheetWith(TerrainPreset.Ground29, 5, 13)
      second.forEach((sig, index) => {
        if (!sig.blank) sheet[index] = sig
      })
      expect(findTerrainProposals(sheet, SHEET).length).toBe(2)
    })

    await it('skips tiles it is told another brush already owns', async () => {
      const sheet = sheetWith(TerrainPreset.Ground29, 5, 7)
      const found = findTerrainProposals(sheet, SHEET, new Set([7 * SHEET.columns + 5]))
      expect(found.some((proposal) => proposal.preset === TerrainPreset.Ground29)).toBe(false)
    })

    await it('finds nothing in a sheet of plain full tiles', async () => {
      const full: TileSignature = { bits: 255, blank: false }
      const sheet = Array.from({ length: SHEET.columns * SHEET.rows }, () => full)
      expect(findTerrainProposals(sheet, SHEET).length).toBe(0)
    })

    await it('finds nothing in a blank sheet', async () => {
      const sheet = Array.from({ length: SHEET.columns * SHEET.rows }, () => BLANK)
      expect(findTerrainProposals(sheet, SHEET).length).toBe(0)
    })
  })
}
