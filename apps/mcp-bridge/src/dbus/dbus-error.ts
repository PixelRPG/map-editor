import { resolve } from '../instance-routing.ts'
import { fail, type ToolResult } from '../tool-result.ts'

/**
 * Errors GDBus raises when nothing owns the name we dialled — i.e. the
 * editor instance simply is not running, which is the one failure an agent
 * can act on itself.
 */
const NOT_RUNNING = /ServiceUnknown|NameHasNoOwner|was not provided by any|StartServiceByName/

/** Strips GDBus's wrapper ("GDBus.Error:…JSError…: <original message>") off a remote throw. */
const REMOTE_MESSAGE = /GDBus\.Error:[^\s:]*:\s*([\s\S]+)/

/**
 * Prefixes the Control service throws with for rejections the agent is
 * meant to read verbatim: assistant-paused (the user paused the AI;
 * mutating calls are rejected until the user resumes), human-only-action
 * (win.toggle-assistant-paused is the user's switch — never driveable from
 * here), no-engine / nothing-to-undo / nothing-to-redo (the call would have
 * been a silent no-op).
 */
const EDITOR_REJECTION = /^(assistant-paused|human-only-action|no-engine|nothing-to-undo|nothing-to-redo):/

/** What a failed Control call turned out to be. */
export type DbusFailure =
  /** Nothing owns the bus name — the instance is not running. */
  | { kind: 'not-running' }
  /** The editor answered with a typed rejection; `message` is its own wording. */
  | { kind: 'rejected'; message: string }
  /** Anything else; `message` is the remote message when there was one, else the raw error. */
  | { kind: 'failed'; message: string }

/** Classify a D-Bus error message. Pure — the wording it produces is asserted in the spec. */
export function classifyDbusError(message: string): DbusFailure {
  if (NOT_RUNNING.test(message)) return { kind: 'not-running' }
  const remote = REMOTE_MESSAGE.exec(message)?.[1]?.trim()
  if (remote && EDITOR_REJECTION.test(remote)) return { kind: 'rejected', message: remote }
  return { kind: 'failed', message: remote ?? message }
}

/**
 * Turn a rejected Control call into the tool answer the agent sees. Typed
 * editor-side rejections surface their own descriptive message instead of
 * the D-Bus noise wrapped around it.
 */
export function dbusError(error: unknown, label?: string): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  const failure = classifyDbusError(message)
  if (failure.kind === 'rejected') return fail(failure.message)
  if (failure.kind === 'failed') return fail(`D-Bus call failed: ${failure.message}`)
  const { label: which, busName } = resolve(label)
  return fail(
    `The PixelRPG Maker instance "${which}" is not running on the session bus (${busName}). ` +
      (which === 'default'
        ? 'Start it with `gjsify workspace @pixelrpg/maker-gjs start`.'
        : 'Launch it with the launch_instance tool first.') +
      ` (D-Bus error: ${message})`,
  )
}
