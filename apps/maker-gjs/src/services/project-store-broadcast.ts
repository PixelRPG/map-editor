import {
  createEntityRemoveOp,
  createEntityUpsertOp,
  createGameSystemsSetOp,
  createPlayerSetOp,
  createProjectMetaUpdateOp,
  createSpriteSetRemoveOp,
  type EntityDefinition,
  type GameProjectData,
  type ProjectOp,
  type ProjectMetaUpdateOp,
  type SpriteSetAddPayload,
  type SpriteSetData,
  type SpriteSetUpdatePayload,
} from '@pixelrpg/engine'

/**
 * The wire half of `ProjectStore`: every outbound `__project/*` message
 * it can produce, plus the registration of the inbound sinks. One file
 * to audit against `sync/project-operations.ts` when the wire shape
 * moves — and one place that proves each project-level mutation has a
 * broadcast, the pairing the transport-ready-primitives rule exists to
 * enforce.
 *
 * Every `broadcast*` takes a nullable session and no-ops without one:
 * solo editing is the common case, and the store's mutations should not
 * each repeat that check.
 */

/**
 * The slice of `CollabSession` the store drives: outbound project-op /
 * sprite-set broadcast plus the inbound sinks the store registers
 * itself on. Structural so tests can pass an in-memory fake without
 * constructing a real WebRTC session.
 */
export interface ProjectSyncSession {
  sendProjectOp(build: (ctx: { peerId: string; seq: number }) => ProjectOp): void
  sendSpriteSetAdd(payload: SpriteSetAddPayload): void
  sendSpriteSetUpdate(payload: SpriteSetUpdatePayload): void
  onProjectOpReceived: ((op: ProjectOp) => void) | null
  onSpriteSetAddReceived: ((payload: SpriteSetAddPayload) => void) | null
  onSpriteSetUpdateReceived: ((payload: SpriteSetUpdatePayload) => void) | null
}

/** The three inbound handlers the single applier registers on a session. */
export interface ProjectOpSinks {
  projectOp: (op: ProjectOp) => void
  spriteSetAdd: (payload: SpriteSetAddPayload) => void
  spriteSetUpdate: (payload: SpriteSetUpdatePayload) => void
}

/**
 * Point a session's inbound handlers at `sinks`, or clear them with
 * `null` — which returns the session to buffering inbound ops until an
 * applier is ready for them.
 */
export function bindProjectSinks(session: ProjectSyncSession, sinks: ProjectOpSinks | null): void {
  session.onProjectOpReceived = sinks?.projectOp ?? null
  session.onSpriteSetAddReceived = sinks?.spriteSetAdd ?? null
  session.onSpriteSetUpdateReceived = sinks?.spriteSetUpdate ?? null
}

/** Broadcast a created / edited entity definition; peers replace it by id. */
export function broadcastEntityUpsert(session: ProjectSyncSession | null, entity: EntityDefinition): void {
  session?.sendProjectOp(({ peerId, seq }) => createEntityUpsertOp({ peerId, seq, entity }))
}

/** Broadcast an entity removal; peers drop it by id. */
export function broadcastEntityRemove(session: ProjectSyncSession | null, entityId: string): void {
  session?.sendProjectOp(({ peerId, seq }) => createEntityRemoveOp({ peerId, seq, entityId }))
}

/** Broadcast the project's player actor (`null` clears it). */
export function broadcastPlayerSet(session: ProjectSyncSession | null, playerActorId: string | null): void {
  session?.sendProjectOp(({ peerId, seq }) => createPlayerSetOp({ peerId, seq, playerActorId }))
}

/** Broadcast the project's whole name + properties bag; peers replace both wholesale. */
export function broadcastProjectMeta(
  session: ProjectSyncSession | null,
  name: string,
  properties: ProjectMetaUpdateOp['payload']['properties'],
): void {
  session?.sendProjectOp(({ peerId, seq }) => createProjectMetaUpdateOp({ peerId, seq, name, properties }))
}

/**
 * Broadcast the project's whole enabled-game-systems record; peers
 * replace it wholesale. Coarse + idempotent like `meta.update` — a peer
 * that predates this kind ignores it and keeps editing as if the system
 * were off, which is the dormant behaviour, so nothing diverges beyond
 * "that peer sees fewer rows".
 */
export function broadcastGameSystems(
  session: ProjectSyncSession | null,
  gameSystems: NonNullable<GameProjectData['gameSystems']>,
): void {
  session?.sendProjectOp(({ peerId, seq }) => createGameSystemsSetOp({ peerId, seq, gameSystems }))
}

/** Broadcast a sprite-set deletion; peers drop the reference and its files. */
export function broadcastSpriteSetRemove(session: ProjectSyncSession | null, spriteSetId: string): void {
  session?.sendProjectOp(({ peerId, seq }) => createSpriteSetRemoveOp({ peerId, seq, spriteSetId }))
}

/** Broadcast a whole sprite set — descriptor plus base64 image bytes (chunked by the session). */
export function broadcastSpriteSetAdd(
  session: ProjectSyncSession | null,
  data: SpriteSetData,
  imageBase64: string,
): void {
  session?.sendSpriteSetAdd({ data, imageBase64 })
}

/** Broadcast a sprite set's DESCRIPTOR only — the peer already has the image. */
export function broadcastSpriteSetUpdate(session: ProjectSyncSession | null, data: SpriteSetData): void {
  session?.sendSpriteSetUpdate({ data })
}
