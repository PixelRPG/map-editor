import {
  defaultTerrainLayout,
  type TerrainLayout,
  type TerrainLayoutPart,
  type TerrainPreset,
  terrainPresetSpec,
  terrainTilesForPreset,
} from '@pixelrpg/engine'

import type { SheetFrame, SheetSpan } from '../editor/tile-sheet.geometry.ts'

// The GTK-free half of the terrain definition dialog's placement page
// (TERRAIN.md § 5.2): where a preset's parts sit on the sheet, which of
// them a tap moves, and whether the result could be written at all.
//
// Apart from the widget because this is the half that can be wrong in a
// way a screenshot does not show — a part half off the sheet still
// draws, it just silently loses tiles when `terrainTilesForPreset`
// skips them.

/** The sheet a block is being placed on, in cells. */
export interface PlacementSheet {
  readonly columns: number
  readonly rows: number
}

/** Where every part of a preset currently sits, and which one is active. */
export interface TerrainPlacement {
  readonly preset: TerrainPreset
  readonly parts: Record<string, TerrainLayoutPart>
  /** The part a tap or an arrow key moves. */
  readonly activePart: string
}

/** Why a placement cannot be written. */
export type PlacementProblem =
  | { readonly kind: 'off-sheet'; readonly part: string }
  | { readonly kind: 'overlap'; readonly part: string; readonly other: string }

/**
 * Drop `preset` on the sheet, as close to the top-left as it fits.
 *
 * Not at `0, 0`: `patch-13`'s corners sit two columns LEFT of its block,
 * so the block at column 0 would put them off the sheet, and the dialog
 * would open on an invalid placement the author never made. The offsets
 * are the preset's own, so this stays right for a preset added later.
 */
export function startPlacement(preset: TerrainPreset, sheet: PlacementSheet): TerrainPlacement {
  const spec = terrainPresetSpec(preset)
  const parts = spec?.parts ?? []
  const col = -Math.min(0, ...parts.map((part) => part.dc))
  const row = -Math.min(0, ...parts.map((part) => part.dr))
  const layout = defaultTerrainLayout(preset, col, row)
  return clampToSheet({ preset, parts: layout.parts, activePart: parts[0]?.id ?? '' }, sheet)
}

/** Reopen on a terrain's stored layout, so the frames land where they were left. */
export function placementFromLayout(layout: TerrainLayout): TerrainPlacement {
  const spec = terrainPresetSpec(layout.preset)
  const first = spec?.parts[0]?.id ?? ''
  const parts: Record<string, TerrainLayoutPart> = {}
  // Through the spec rather than over `layout.parts`, so a layout
  // written by an older version (or by hand) gains the parts it lacks
  // at their default offsets instead of leaving frames unplaced.
  for (const part of spec?.parts ?? []) {
    const stored = layout.parts[part.id]
    const anchor = layout.parts[first]
    parts[part.id] = stored ?? {
      col: (anchor?.col ?? 0) + part.dc,
      row: (anchor?.row ?? 0) + part.dr,
    }
  }
  return { preset: layout.preset, parts, activePart: first }
}

/** Move the active part's top-left to this cell (what a tap on the sheet does). */
export function placeActivePart(state: TerrainPlacement, col: number, row: number): TerrainPlacement {
  const origin = state.parts[state.activePart]
  if (!origin) return state
  return movePart(state, state.activePart, col - origin.col, row - origin.row)
}

/** Nudge the active part by whole cells (what an arrow key does). */
export function nudgeActivePart(state: TerrainPlacement, dc: number, dr: number): TerrainPlacement {
  return movePart(state, state.activePart, dc, dr)
}

/**
 * Shift one part by `dc, dr`.
 *
 * The FIRST part carries the others with it; any later part moves
 * alone. That is the difference between the two things an author does
 * here: "the block is over there" moves the whole arrangement, and
 * "this pack's corners sit a row lower" (§2.2, the case that made parts
 * exist) adjusts one piece of it. Were the first part to move alone, the
 * preset's defaults would be thrown away by the first tap.
 */
export function movePart(state: TerrainPlacement, partId: string, dc: number, dr: number): TerrainPlacement {
  const spec = terrainPresetSpec(state.preset)
  const first = spec?.parts[0]?.id
  const moved = partId === first ? Object.keys(state.parts) : [partId]
  const parts: Record<string, TerrainLayoutPart> = {}
  for (const [id, origin] of Object.entries(state.parts)) {
    parts[id] = moved.includes(id) ? { col: origin.col + dc, row: origin.row + dr } : origin
  }
  return { ...state, parts }
}

/** Switch which part a tap moves. Unknown ids are ignored. */
export function setActivePart(state: TerrainPlacement, partId: string): TerrainPlacement {
  if (!state.parts[partId]) return state
  return { ...state, activePart: partId }
}

/** Pull every part back inside the sheet, keeping their relative offsets where it can. */
export function clampToSheet(state: TerrainPlacement, sheet: PlacementSheet): TerrainPlacement {
  const parts: Record<string, TerrainLayoutPart> = {}
  for (const span of partSpans(state)) {
    parts[span.part] = {
      col: clamp(span.col, 0, sheet.columns - span.columns),
      row: clamp(span.row, 0, sheet.rows - span.rows),
    }
  }
  return { ...state, parts }
}

/** One part's block on the sheet. */
export interface PlacementSpan extends SheetSpan {
  readonly part: string
}

/** Every part's block, in the preset's own order. */
export function partSpans(state: TerrainPlacement): PlacementSpan[] {
  const spec = terrainPresetSpec(state.preset)
  const spans: PlacementSpan[] = []
  for (const part of spec?.parts ?? []) {
    const origin = state.parts[part.id]
    if (!origin) continue
    spans.push({ part: part.id, col: origin.col, row: origin.row, columns: part.columns, rows: part.rows })
  }
  return spans
}

/**
 * What is wrong with this placement, if anything — an empty list means
 * "Create" is live.
 *
 * Two things only. A part hanging off the sheet would quietly drop its
 * tiles, and two parts on the same cells would hand one sprite two
 * meanings, with whichever came last winning. Sharing tiles with ANOTHER
 * brush is deliberately not checked: two brushes sharing a shoreline is
 * a thing a sheet may really do, and deciding whether it is an error is
 * a design question this step does not answer.
 */
export function placementProblems(state: TerrainPlacement, sheet: PlacementSheet): PlacementProblem[] {
  const spans = partSpans(state)
  const problems: PlacementProblem[] = []
  for (const span of spans) {
    if (span.col < 0 || span.row < 0 || span.col + span.columns > sheet.columns || span.row + span.rows > sheet.rows) {
      problems.push({ kind: 'off-sheet', part: span.part })
    }
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (!spansOverlap(spans[i], spans[j])) continue
      problems.push({ kind: 'overlap', part: spans[j].part, other: spans[i].part })
    }
  }
  return problems
}

/** The outlines to draw on the sheet: active on top, the broken ones red. */
export function placementFrames(state: TerrainPlacement, sheet: PlacementSheet): SheetFrame[] {
  const broken = new Set(placementProblems(state, sheet).map((problem) => problem.part))
  return partSpans(state).map((span) => ({
    span: { col: span.col, row: span.row, columns: span.columns, rows: span.rows },
    tone: broken.has(span.part) ? 'error' : span.part === state.activePart ? 'active' : 'idle',
  }))
}

/** The `tiles` table this placement writes. */
export function placementTiles(state: TerrainPlacement, sheet: PlacementSheet): Record<string, number> {
  return terrainTilesForPreset(state.preset, state.parts, sheet)
}

/** The layout to store alongside it, so the dialog reopens on these frames. */
export function placementLayout(state: TerrainPlacement): TerrainLayout {
  return { preset: state.preset, parts: { ...state.parts } }
}

/**
 * Every sprite id the placement covers, in sheet order — what the
 * walkable switch writes collision for, and what the overlay flag is
 * derived from.
 *
 * The placement rather than the `tiles` table, because a preset may
 * cover a cell it has no mask for (`ground-29`'s last cell is empty),
 * and "can the hero walk here" is about the picture, not the table.
 */
export function placementSpriteIds(state: TerrainPlacement, sheet: PlacementSheet): number[] {
  const ids = new Set<number>()
  for (const span of partSpans(state)) {
    for (let row = span.row; row < span.row + span.rows; row++) {
      for (let col = span.col; col < span.col + span.columns; col++) {
        if (col < 0 || row < 0 || col >= sheet.columns || row >= sheet.rows) continue
        ids.add(row * sheet.columns + col)
      }
    }
  }
  return [...ids].sort((a, b) => a - b)
}

/**
 * The sprite ids the TABLE uses, which is the set the overlay flag is
 * read from: a block's empty corner cell says nothing about whether the
 * brush keeps the floor beneath it.
 */
export function placementTableSpriteIds(state: TerrainPlacement, sheet: PlacementSheet): number[] {
  return [...new Set(Object.values(placementTiles(state, sheet)))].sort((a, b) => a - b)
}

/**
 * A name no other brush of the set has: "Brush", then "Brush 2"…
 *
 * Numbered rather than "Brush (1)" because the number is read aloud by
 * the people this dialog is for.
 */
export function nextBrushName(taken: readonly string[], base: string): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; n < 1000; n++) {
    const name = `${base} ${n}`
    if (!used.has(name.toLowerCase())) return name
  }
  return base
}

/** A terrain id no other brush of the set has, derived from its name. */
export function terrainIdFor(name: string, taken: readonly string[]): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'terrain'
  const used = new Set(taken)
  if (!used.has(slug)) return slug
  for (let n = 2; n < 1000; n++) {
    if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`
  }
  return slug
}

function spansOverlap(a: SheetSpan, b: SheetSpan): boolean {
  return a.col < b.col + b.columns && b.col < a.col + a.columns && a.row < b.row + b.rows && b.row < a.row + a.rows
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}
