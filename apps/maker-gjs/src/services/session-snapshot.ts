import type { SessionState } from './session-service.ts'

/**
 * JSON-safe view of the collaboration session state for external tooling
 * (the Control D-Bus plane `JSON.stringify`s it).
 */
export interface SessionSnapshot {
  kind: string
  roomId?: string
  port?: number
  role?: string
  sandboxProjectPath?: string
}

/**
 * Project a `SessionService` state into the flat JSON snapshot the Control
 * plane returns. Pure (type-only import) so it unit-tests under node;
 * `null` (no service yet) maps to `{ kind: 'idle' }`.
 *
 * The key whitelist is deliberate: the `awaiting-engine` / `connected`
 * arms carry a live `CollabSession` on `state.collab`, which must NEVER
 * reach the JSON wire — only the scalar `roomId`/`port`/`role`/
 * `sandboxProjectPath` are copied across.
 */
export function toSessionSnapshot(state: SessionState | null): SessionSnapshot {
  const s = state ?? { kind: 'idle' as const }
  const snap: SessionSnapshot = { kind: s.kind }
  if ('roomId' in s) snap.roomId = s.roomId
  if ('port' in s) snap.port = s.port
  if ('role' in s) snap.role = s.role
  if ('sandboxProjectPath' in s) snap.sandboxProjectPath = s.sandboxProjectPath
  return snap
}
