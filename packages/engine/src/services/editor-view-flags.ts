/**
 * Pure reads + merges over {@link EditorViewFlags}.
 *
 * The engine reads the flag triple from four places (getter, partial
 * update, subscription bridge, no-scene fallback) and each one used to
 * spell out the same `?? false` / `?? true` defaults inline — a new
 * flag meant editing four copies, and `objectsVisible` (the one that
 * defaults to `true`) is exactly the kind of asymmetry a missed copy
 * gets wrong. Kept Excalibur-free so it unit-tests without a scene.
 */

import type { EditorViewFlags } from '../components/editor-view-mode.component.ts'

/**
 * Flags reported when nothing has been set yet. `objectsVisible`
 * defaults ON — placements are part of the map, the Layers tab's
 * "Objects" toggle is opt-OUT.
 */
export const DEFAULT_EDITOR_VIEW_FLAGS = {
  showGrid: false,
  dimInactiveLayers: false,
  objectsVisible: true,
} as const satisfies EditorViewFlags

/** Source shape for a read — the component, or `null`/`undefined` when unset. */
export interface EditorViewFlagsSource {
  readonly showGrid?: boolean
  readonly dimInactiveLayers?: boolean
  readonly objectsVisible?: boolean
}

/** Normalise a (possibly absent) flag carrier into a complete snapshot. */
export function readEditorViewFlags(source: EditorViewFlagsSource | null | undefined): EditorViewFlags {
  return {
    showGrid: source?.showGrid ?? DEFAULT_EDITOR_VIEW_FLAGS.showGrid,
    dimInactiveLayers: source?.dimInactiveLayers ?? DEFAULT_EDITOR_VIEW_FLAGS.dimInactiveLayers,
    objectsVisible: source?.objectsVisible ?? DEFAULT_EDITOR_VIEW_FLAGS.objectsVisible,
  }
}

/** Overlay `partial` on the current flags, filling gaps from the defaults. */
export function mergeEditorViewFlags(
  current: EditorViewFlagsSource | null | undefined,
  partial: Partial<EditorViewFlags>,
): EditorViewFlags {
  const base = readEditorViewFlags(current)
  return {
    showGrid: partial.showGrid ?? base.showGrid,
    dimInactiveLayers: partial.dimInactiveLayers ?? base.dimInactiveLayers,
    objectsVisible: partial.objectsVisible ?? base.objectsVisible,
  }
}

/**
 * Whether an already-present flag carrier matches `next` in every
 * field. Only meaningful for a carrier that exists — an absent one
 * must still be written out, even when its defaults happen to equal
 * `next`, so subscribers get a concrete component to read.
 */
export function editorViewFlagsEqual(
  current: EditorViewFlagsSource | null | undefined,
  next: EditorViewFlags,
): boolean {
  if (!current) return false
  return (
    current.showGrid === next.showGrid &&
    current.dimInactiveLayers === next.dimInactiveLayers &&
    current.objectsVisible === next.objectsVisible
  )
}
