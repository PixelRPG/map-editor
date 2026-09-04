import type { Engine, ProjectSnapshot, SignallingTransport } from '@pixelrpg/engine'

import type { ScopedLogger } from './collab-log.ts'
import { writeSnapshotToSandbox } from './sandbox-path.ts'

/** The slice of `CollabSession` the host open-flow drives. */
export interface HostCollab {
  start(): Promise<void>
  close(reason: string): void
}

/** The slice of `CollabSession` the joiner open-flow drives. */
export interface JoinerCollab {
  start(): Promise<void>
  requestSnapshot(timeoutMs?: number): Promise<ProjectSnapshot>
}

export interface JoinerHandshakeDeps {
  log: ScopedLogger
  snapshotTimeoutMs?: number
  /** Injectable so the sequence unit-tests without touching the XDG data dir. */
  writeSandbox?: (snapshot: ProjectSnapshot, roomId: string) => Promise<string>
}

/**
 * Resolve the engine a host session needs. You can't share what you
 * don't have, so an absent engine is a hard failure — and the signalling
 * transport the joiner already opened is closed on the way out so its FD
 * doesn't leak.
 */
export function requireHostEngine(engine: Engine | null, transport: SignallingTransport): Engine {
  if (engine) return engine
  try {
    transport.close()
  } catch {
    /* best-effort */
  }
  throw new Error('SessionService: no engine available — load a project before hosting')
}

/**
 * Await the handshake, tearing the session down before rethrowing.
 *
 * Without the teardown a peer-connect timeout leaves an orphaned
 * `PeerSession` + awareness channel behind — it keeps answering on the
 * wire although no state machine owns it any more.
 */
export async function startOrTearDown(collab: HostCollab, closeReason: string): Promise<void> {
  try {
    await collab.start()
  } catch (err) {
    try {
      collab.close(closeReason)
    } catch {
      /* best-effort */
    }
    throw err
  }
}

/**
 * The joiner's critical path: connect → pull the host's snapshot →
 * write it to a per-room sandbox directory. Returns the sandbox
 * `game-project.json` path for the UI layer to open.
 *
 * Each step logs before it blocks, so a hang in the field names the leg
 * it hung on — the 2026-05-30 symptom ("joiner WS connects but nothing
 * else happens") was undiagnosable precisely because it didn't.
 */
export async function pullSnapshotToSandbox(
  collab: JoinerCollab,
  roomId: string,
  deps: JoinerHandshakeDeps,
): Promise<string> {
  const { log, snapshotTimeoutMs, writeSandbox = writeSnapshotToSandbox } = deps
  log.info(`joiner: collab.start() awaiting peer-connect…`)
  await collab.start()
  log.info(`joiner: peer connected; requesting snapshot (timeout=${snapshotTimeoutMs ?? 'default'})…`)
  const snapshot = await collab.requestSnapshot(snapshotTimeoutMs)
  log.info(
    `joiner: snapshot received (project="${snapshot.project?.name ?? '<no name>'}", maps=${snapshot.maps?.length ?? 0}); writing sandbox…`,
  )
  const sandboxProjectPath = await writeSandbox(snapshot, roomId)
  log.info(`joiner: sandbox written to ${sandboxProjectPath}`)
  return sandboxProjectPath
}
