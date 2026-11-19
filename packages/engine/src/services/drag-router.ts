/**
 * What a one-finger drag on the canvas means — the single decision
 * behind TERRAIN.md §6.3's "pan for `select`, stroke for mutating
 * tools".
 *
 * Two systems need the answer and must never disagree about it:
 * {@link TileEditorSystem} opens the stroke, {@link CameraControlSystem}
 * holds the camera still while one is running. Keeping the rule pure
 * and in one place is what lets both ask the same question instead of
 * threading a flag between them.
 */

import type { EditorTool } from '../components/active-tool.component.ts'

/** The two things a one-finger drag can be. */
export type DragIntent = 'pan' | 'stroke'

/**
 * The CONTINUOUS tools: the ones a drag paints with rather than
 * panning, and the ones `TileEditorSystem.buildBrushCommand` can lay a
 * single application of.
 */
export type BrushTool = 'pencil' | 'eraser'

/**
 * Deliberately only those two. The other mutating tools are point
 * tools by nature: a dragged bucket would flood-fill once per crossed
 * cell (each one re-walking the region the previous one just
 * repainted), and a dragged object brush would scatter a placement per
 * cell. Both are tap tools in every editor that has them, so their
 * drag keeps the pan it has always had — which is also the only way to
 * move the map while they are armed.
 */
export const STROKE_TOOLS: readonly BrushTool[] = ['pencil', 'eraser']

/** Whether `tool` is one of the two {@link STROKE_TOOLS}. */
export function isBrushTool(tool: EditorTool): tool is BrushTool {
  return (STROKE_TOOLS as readonly EditorTool[]).includes(tool)
}

export interface DragIntentQuery {
  /** Whether the editor tools are live at all (see `EditorModeComponent`). */
  readonly editing: boolean
  readonly tool: EditorTool
  /**
   * Whether the layer the stroke would land on is padlocked. A locked
   * layer pans rather than doing nothing: refusing the edit is right,
   * refusing the gesture as well would leave the user unable to scroll
   * a map whose active layer happens to be locked (§7.3).
   */
  readonly layerLocked: boolean
}

/**
 * Pan unless everything lines up for a stroke. The default direction
 * matters: a scene with no editor, an unknown tool or a locked layer
 * all fall back to the pan the canvas has always done, so no
 * combination can leave a drag doing nothing at all.
 */
export function resolveDragIntent(query: DragIntentQuery): DragIntent {
  if (!query.editing) return 'pan'
  if (!isBrushTool(query.tool)) return 'pan'
  if (query.layerLocked) return 'pan'
  return 'stroke'
}
