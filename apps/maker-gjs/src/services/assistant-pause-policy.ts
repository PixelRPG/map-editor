/**
 * Pause policy for the AI assistant's Control (D-Bus/MCP) plane — the
 * pure, spec-guarded classification behind the contract in
 * docs/concepts/ai-collaborator.md § "Pause contract".
 *
 * Pause is the HUMAN's safety switch over the AI:
 * - while paused, every MUTATING Control method is rejected with a typed
 *   {@link AssistantPausedError} (read-only/diagnostic methods keep
 *   working so the agent can still observe state),
 * - `win.toggle-assistant-paused` can NEVER be driven from the control
 *   plane ({@link HumanOnlyActionError}) — the AI cannot un-pause itself,
 * - the human's own UI is never gated by pause.
 */

/** Thrown when a mutating Control call arrives while the user paused the assistant. */
export class AssistantPausedError extends Error {
  override readonly name = 'AssistantPausedError'

  constructor(method: string) {
    super(
      `assistant-paused: ${method} rejected — the user paused the AI assistant. ` +
        'Wait for the user to resume (only the user can, via the pause button / win.toggle-assistant-paused). ' +
        'Read-only calls (GetStatus, Screenshot, List*) keep working.',
    )
  }
}

/** Thrown when the control plane tries to drive a human-only action (any pause state). */
export class HumanOnlyActionError extends Error {
  override readonly name = 'HumanOnlyActionError'

  constructor(action: string) {
    super(
      `human-only-action: ${action} is the user's safety switch over the AI ` +
        'and cannot be driven from the control plane (UI only).',
    )
  }
}

/** Thrown when a Control call cannot act (no engine, empty undo stack, …) instead of silently no-opping. */
export class ControlUnavailableError extends Error {
  override readonly name = 'ControlUnavailableError'

  constructor(reason: string, hint: string) {
    super(`${reason}: ${hint}`)
  }
}

/**
 * How a Control method behaves while the assistant is paused:
 * - `read-only` — observation/diagnostics, always allowed.
 * - `presence` — the assistant's own awareness channel (labelling,
 *   opt-out); allowed (the cursor additionally self-gates in the engine).
 * - `mutating` — edits project data or the user's UI/session; rejected
 *   with {@link AssistantPausedError} while paused.
 */
export type ControlMethodKind = 'read-only' | 'presence' | 'mutating'

/**
 * EVERY method of `org.pixelrpg.maker.Control`, classified. A new D-Bus
 * method MUST be added here (the guard throws on unclassified names) and
 * to the spec's expected table — that's the drift guard.
 *
 * Notes:
 * - `PresentWindow` raises the user's window but is required by the MCP
 *   bridge's screenshot retry path — diagnostics, so `read-only`.
 * - `ActivateAction`/`ChangeActionState` are `mutating` wholesale: every
 *   `win.*`/`app.*` action mutates project data or the user's UI (there
 *   is no read-only action today), so there is no per-action allowlist.
 */
export const CONTROL_METHOD_KINDS = {
  GetStatus: 'read-only',
  Screenshot: 'read-only',
  ListActions: 'read-only',
  ListRecentProjects: 'read-only',
  ListTemplates: 'read-only',
  GetMapData: 'read-only',
  GetSessionState: 'read-only',
  PresentWindow: 'read-only',
  SetAssistantInfo: 'presence',
  SetAssistantCursor: 'presence',
  HideAssistant: 'presence',
  ActivateAction: 'mutating',
  ChangeActionState: 'mutating',
  OpenProject: 'mutating',
  StartSession: 'mutating',
  JoinSession: 'mutating',
  SetZoom: 'mutating',
  ResizeWindow: 'mutating',
  PaintTile: 'mutating',
  PlaceObject: 'mutating',
  FollowParticipant: 'mutating',
} as const satisfies Record<string, ControlMethodKind>

/** `win.*` actions the control plane may never drive — the user's own safety switches. */
export const HUMAN_ONLY_ACTIONS: ReadonlySet<string> = new Set(['toggle-assistant-paused'])

/**
 * Engine-backed `win.*` actions whose handlers silently no-op without a
 * live engine (or with an empty stack) — the Control plane reports those
 * as typed errors instead of false success (see {@link guardEngineAction}).
 */
export const ENGINE_REQUIRED_ACTIONS: ReadonlySet<string> = new Set([
  'undo',
  'redo',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'play',
])

/** The slice of editor state {@link guardEngineAction} needs. */
export interface EngineActionContext {
  engineReady: boolean
  canUndo: boolean
  canRedo: boolean
}

/**
 * Reject `method` while the assistant is paused (mutating methods only).
 * Throws on an unclassified method so a new D-Bus method can't bypass the
 * policy unnoticed.
 */
export function guardControlMethod(method: string, paused: boolean): void {
  const kind = (CONTROL_METHOD_KINDS as Record<string, ControlMethodKind | undefined>)[method]
  if (!kind) {
    throw new Error(
      `Unclassified Control method '${method}' — add it to CONTROL_METHOD_KINDS (assistant-pause-policy.ts)`,
    )
  }
  if (kind === 'mutating' && paused) throw new AssistantPausedError(method)
}

/**
 * Reject control-plane access to human-only actions — regardless of the
 * pause state (the AI must never flip the user's safety switch).
 */
export function guardControlAction(scope: 'app' | 'win', name: string): void {
  if (scope === 'win' && HUMAN_ONLY_ACTIONS.has(name)) throw new HumanOnlyActionError(`win.${name}`)
}

/**
 * Reject engine-backed actions that would silently no-op: no live engine,
 * or undo/redo on an empty stack. Non-engine actions pass through (their
 * GAction state persists window-side now and is re-pushed into the next
 * engine, so flipping e.g. `win.toggle-grid` without an engine is a real,
 * honest state change).
 */
export function guardEngineAction(scope: 'app' | 'win', name: string, context: EngineActionContext): void {
  if (scope !== 'win' || !ENGINE_REQUIRED_ACTIONS.has(name)) return
  if (!context.engineReady) {
    throw new ControlUnavailableError(
      'no-engine',
      `win.${name} needs a live scene engine — open a scene first (open_scene / win.open-scene-by-id), then retry.`,
    )
  }
  if (name === 'undo' && !context.canUndo) {
    throw new ControlUnavailableError('nothing-to-undo', 'the undo stack is empty — nothing was undone.')
  }
  if (name === 'redo' && !context.canRedo) {
    throw new ControlUnavailableError('nothing-to-redo', 'the redo stack is empty — nothing was redone.')
  }
}
