// GTK-free on purpose: no `gettext`, no `gi://` — the spec runs under `gjsify test`.
// The widget maps these ids to translated labels.

/** What a cell of the animation matrix offers its owner. */
export type CellAction = 'edit' | 'play' | 'clear'

/** A cell either holds an animation with pictures, or is still empty. */
export type CellState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'filled'; readonly frames: number; readonly durationMs: number }

interface AnimationLike {
  readonly frames: readonly { readonly duration: number }[]
}

/** Cell state of an animation entry; one without pictures counts as empty. */
export function cellState(anim: AnimationLike | null | undefined): CellState {
  if (!anim || anim.frames.length === 0) return { kind: 'empty' }
  return { kind: 'filled', frames: anim.frames.length, durationMs: anim.frames.reduce((s, f) => s + f.duration, 0) }
}

/**
 * Entries of a cell's "⋯" menu, in display order. An empty cell has no menu —
 * it is a single "+" button instead — so there is nothing to clear or play.
 */
export function cellMenuActions(state: CellState): CellAction[] {
  return state.kind === 'empty' ? [] : ['edit', 'play', 'clear']
}

/** What a tap on the cell body does: a filled cell drives the preview, an empty one starts filling. */
export function cellTapIntent(state: CellState): 'select' | 'edit' {
  return state.kind === 'filled' ? 'select' : 'edit'
}

/** Smallest cell width that keeps the "⋯" button a comfortable tap target. */
export const MIN_GRID_CELL = 88
/** Action-label column plus the four direction columns. */
export const GRID_COLUMNS = 5
export const GRID_SPACING = 8

/** Narrowest matrix width that still lays out as a grid. */
export const GRID_MIN_WIDTH = MIN_GRID_CELL * GRID_COLUMNS + GRID_SPACING * (GRID_COLUMNS - 1)

/** Whether a matrix `width` px wide fits the grid; narrower gets one boxed list per action. */
export function gridFits(width: number): boolean {
  return width >= GRID_MIN_WIDTH
}
