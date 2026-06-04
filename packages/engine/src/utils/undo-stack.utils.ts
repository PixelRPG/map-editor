import type { UndoStackComponent } from '../components/undo-stack.component.ts'

/**
 * Pure read helpers for {@link UndoStackComponent}.
 *
 * Components are data-only per AGENTS.md ECS doctrine — these
 * convenience predicates live next to the component as free
 * functions instead of getters so the component stays a plain
 * struct. Callers that previously read `stack.canUndo` now read
 * `canUndo(stack)`.
 */
export function canUndo(stack: UndoStackComponent): boolean {
  return stack.cursor > 0
}

export function canRedo(stack: UndoStackComponent): boolean {
  return stack.cursor < stack.commands.length
}
