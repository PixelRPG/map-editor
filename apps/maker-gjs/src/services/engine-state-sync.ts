import type { EditorTool } from '@pixelrpg/engine'
import type { AssistantStateSnapshot } from './assistant-state.service.ts'

/**
 * Push-on-attach helper: re-applies every piece of window-owned stateful
 * editor state into a freshly (re)created engine.
 *
 * The maker disposes the engine on every scene-editor exit and recreates
 * it on re-entry, so per-engine fields (assistant pause, view flags,
 * active tool, follow state) reset to their defaults each time. The
 * durable owners are the stateful `win.*` GActions + the window's
 * `AssistantStateService`; this module is the ONE place that lists what
 * must be re-pushed — a newly added stateful toggle that consumers expect
 * to survive scene re-entry belongs here (and in the spec).
 *
 * `win.play` is deliberately NOT re-pushed: leaving the scene editor
 * resets it to `false` (a fresh scene starts in editor mode).
 *
 * See docs/concepts/ai-collaborator.md § "State ownership & engine
 * recreation".
 */

/** View-flag + tool surface of the gjs `Engine` widget (structural). */
export interface EditorViewStateSink {
  setActiveTool(tool: EditorTool): void
  setObjectsVisible(visible: boolean): void
  setShowGrid(showGrid: boolean): void
  setDimInactiveLayers(dimInactiveLayers: boolean): void
}

/** Assistant surface of the core `@pixelrpg/engine` Engine (structural). */
export interface AssistantEngineSink {
  setAssistantPaused(paused: boolean): void
  setAssistantInfo(displayName: string, color: string): void
  setFollowAssistant(follow: boolean): void
}

/** Window-owned state snapshot pushed into a fresh engine. */
export interface EditorUiState {
  /** `win.set-tool` state, or `null` when the action isn't installed yet. */
  tool: EditorTool | null
  /** `win.toggle-objects` state. */
  objectsVisible: boolean
  /** `win.toggle-grid` state. */
  showGrid: boolean
  /** `win.toggle-transparency` state. */
  dimInactiveLayers: boolean
  /** The `AssistantStateService` snapshot (presence, identity, pause). */
  assistant: AssistantStateSnapshot
  /** Whether the camera follows the assistant (followed peer == assistant). */
  followAssistant: boolean
}

/**
 * The stateful `win.*` actions whose state survives engine recreation by
 * being re-pushed through {@link syncEngineState} — documentation + spec
 * guard (the list a regression would silently shrink).
 */
export const RESYNCED_WIN_ACTIONS = [
  'set-tool',
  'toggle-objects',
  'toggle-grid',
  'toggle-transparency',
  'toggle-assistant-paused',
] as const

/**
 * Apply `state` to a fresh engine. Assistant identity is only pushed when
 * the assistant is present — `setAssistantInfo` announces a presence frame
 * in the engine's awareness layer, which would resurrect a hidden
 * assistant.
 */
export function syncEngineState(view: EditorViewStateSink, assistant: AssistantEngineSink, state: EditorUiState): void {
  if (state.tool) view.setActiveTool(state.tool)
  view.setObjectsVisible(state.objectsVisible)
  view.setShowGrid(state.showGrid)
  view.setDimInactiveLayers(state.dimInactiveLayers)
  assistant.setAssistantPaused(state.assistant.paused)
  if (state.assistant.present) assistant.setAssistantInfo(state.assistant.name, state.assistant.color)
  assistant.setFollowAssistant(state.followAssistant)
}
