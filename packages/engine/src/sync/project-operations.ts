/**
 * Project-operation message kinds — reliable-channel messages that
 * mutate PROJECT-LEVEL data (the `entityLibrary` — characters + objects,
 * the `playerActorId`, sprite-sets, project metadata, and per-map
 * editor data) rather than scene/map runtime state. The
 * `__project/` prefix is the discriminator that keeps them OUT of the
 * command registry (they aren't `Command`s — they don't operate on a
 * `Scene`) and out of the session-protocol snapshot path.
 *
 * Why a separate channel rather than a `Command`:
 *   - `Command.apply(scene)` only gets a `Scene`; project metadata
 *     (entity library, sprite-sets) lives on the `GameProjectResource`,
 *     not the scene. Commands can't reach it.
 *   - Cast / library editing happens where there is NO live engine/scene
 *     at all. So the command/op-log path isn't even attached.
 * These ops therefore ride the always-present `PeerSession` op channel
 * and are applied directly to each peer's `GameProjectData` by the
 * maker's CollabSession ↔ ProjectStore wiring — see
 * `docs/concepts/collaboration-and-multiplayer.md`.
 *
 * Coarse-grained UPSERT semantics (rather than one op per editable
 * field) keep the surface small + the apply idempotent: an entity edit
 * re-sends the whole affected {@link EntityDefinition}; the receiver
 * replaces-by-id. `player.set` carries the new `playerActorId`; a remove
 * op carries just the id.
 *
 * Naming mirrors `session-protocol.ts`: `__`-prefixed, kinds use `.`
 * after the prefix segment (`__project/entity.upsert`). Any future
 * `__project/*` kind an older peer doesn't recognise is ignored, same
 * forward-compat contract as session-protocol.
 */

import type {
  EntityDefinition,
  GameProjectData,
  MapData,
  MapEditorData,
  MapReference,
  Properties,
  SpriteSetData,
  SpriteSetReference,
} from '../types/index.ts'
import {
  buildChunkEnvelopes,
  CHUNK_SIZE_BYTES,
  type ChunkEnvelope,
  ChunkReassembler as SharedChunkReassembler,
} from './chunking.ts'

export const PROJECT_OP_PREFIX = '__project/'
export const ENTITY_UPSERT_KIND = '__project/entity.upsert'
export const ENTITY_REMOVE_KIND = '__project/entity.remove'
export const PLAYER_SET_KIND = '__project/player.set'
export const PROJECT_META_UPDATE_KIND = '__project/meta.update'
export const GAME_SYSTEMS_SET_KIND = '__project/systems.set'
export const MAP_EDITOR_DATA_KIND = '__project/map.editor-data'
export const SPRITESET_ADD_CHUNK_KIND = '__project/spriteset.add.chunk'
export const SPRITESET_UPDATE_CHUNK_KIND = '__project/spriteset.update.chunk'
export const SPRITESET_REMOVE_KIND = '__project/spriteset.remove'
export const MAP_CREATE_CHUNK_KIND = '__project/map.create.chunk'
export const MAP_RENAME_KIND = '__project/map.rename'
export const MAP_REMOVE_KIND = '__project/map.remove'
export const STARTUP_SET_KIND = '__project/startup.set'

/**
 * Per-chunk payload budget for a sprite-set transfer (chars of the
 * JSON-serialised {@link SpriteSetAddPayload}). 16 KiB matches the
 * snapshot-chunk size in `session-protocol.ts` — well under the WebRTC
 * SCTP `max-message-size` ceiling (RFC 8841 default 64 KiB), above
 * which `webrtcbin` silently drops the send.
 */
export const SPRITESET_CHUNK_SIZE = CHUNK_SIZE_BYTES

/** Peer → peers: an entity definition was created or edited; replace it by id. */
export interface EntityUpsertOp {
  kind: typeof ENTITY_UPSERT_KIND
  payload: { entity: EntityDefinition }
  peerId: string
  /** Per-peer monotonic sequence. Same envelope shape as a normal Operation. */
  seq: number
}

/** Peer → peers: an entity definition was removed; drop it by id. */
export interface EntityRemoveOp {
  kind: typeof ENTITY_REMOVE_KIND
  payload: { entityId: string }
  peerId: string
  seq: number
}

/** Peer → peers: the project's player actor changed (`playerActorId`). */
export interface PlayerSetOp {
  kind: typeof PLAYER_SET_KIND
  payload: { playerActorId: string | null }
  peerId: string
  seq: number
}

/**
 * Peer → peers: project metadata changed (name / author / version /
 * description / `defaultTileSize`, …). Coarse like `entity.upsert`:
 * carries the WHOLE `name` + `properties` bag, the receiver replaces
 * both wholesale — one field edit re-sends everything, so applying
 * twice (or applying a stale duplicate) converges. `defaultTileSize`
 * rides `properties`, so this is NOT cosmetic-only.
 */
export interface ProjectMetaUpdateOp {
  kind: typeof PROJECT_META_UPDATE_KIND
  payload: { name: string; properties: Properties }
  peerId: string
  seq: number
}

/**
 * Peer → peers: the project's enabled game systems changed.
 *
 * Carries the WHOLE `gameSystems` record, wholesale — the same coarse,
 * idempotent discipline as `meta.update`: one switch flip re-sends
 * everything, so applying twice (or applying a stale duplicate)
 * converges. The record is small and the alternative (per-system deltas)
 * would need ordering guarantees the op channel does not give.
 *
 * A peer that does not know this kind ignores it (the `__project/*`
 * forward-compat contract) and keeps editing as if the system were off —
 * which is exactly the dormant behaviour, so nothing diverges beyond
 * "that peer sees fewer rows".
 */
export interface GameSystemsSetOp {
  kind: typeof GAME_SYSTEMS_SET_KIND
  payload: { gameSystems: NonNullable<GameProjectData['gameSystems']> }
  peerId: string
  seq: number
}

/**
 * Peer → peers: a map's editor-only data changed (today: the atlas
 * card position `atlasX`/`atlasY` — atlas drags happen in the atlas
 * view where there is NO live scene, so this can't be a `Command`).
 * Keyed by the map's stable `MapData.id`; the payload is a PARTIAL
 * {@link MapEditorData} merged shallowly onto the map's `editorData`,
 * so future editor-data keys (grid, camera, …) ride the same op
 * without a schema change. Idempotent: re-merging the same patch is
 * a no-op.
 */
export interface MapEditorDataOp {
  kind: typeof MAP_EDITOR_DATA_KIND
  payload: { mapId: string; editorData: MapEditorData }
  peerId: string
  seq: number
}

/**
 * The data a sprite-set import carries to peers: the descriptor plus
 * the image bytes (base64). The receiver writes the image to
 * `data.image.path` (relative, sibling of the descriptor JSON) and
 * registers the set under `data.id` — keeping the id verbatim so a
 * character that references it resolves on the peer too.
 */
export interface SpriteSetAddPayload {
  data: SpriteSetData
  imageBase64: string
}

/**
 * Peer → peers: one chunk of a sprite-set-add transfer. The sender
 * JSON-serialises a {@link SpriteSetAddPayload}, slices it into
 * {@link SPRITESET_CHUNK_SIZE} pieces, and sends one op per slice;
 * the receiver reassembles by `transferId` (see
 * {@link SpriteSetAddReassembler}). Chunked because the image bytes
 * can exceed the SCTP single-send ceiling.
 */
export interface SpriteSetAddChunkOp {
  kind: typeof SPRITESET_ADD_CHUNK_KIND
  payload: {
    /** Stable id grouping the chunks of one transfer (`<peerId>:<n>`). */
    transferId: string
    chunkIndex: number
    totalChunks: number
    /** Slice of the JSON-serialised {@link SpriteSetAddPayload}. */
    data: string
  }
  peerId: string
  seq: number
}

/**
 * The data a sprite-set DESCRIPTOR update carries to peers: just the
 * {@link SpriteSetData} (NO image bytes — the image already exists on
 * every peer from the original add). Sent when a sprite set's metadata
 * changes without the image: a rename (`data.name`), an animation edit
 * (`data.characterAnimations`), or a tile-property change
 * (`data.sprites[].solid`/`surface`). The receiver overwrites only the
 * descriptor JSON + live data; the reference (`firstGid`) + the image
 * file stay untouched.
 */
export interface SpriteSetUpdatePayload {
  data: SpriteSetData
}

/**
 * Peer → peers: one chunk of a sprite-set DESCRIPTOR update. Same
 * chunked transport as {@link SpriteSetAddChunkOp} (a fat tileset
 * descriptor can exceed the SCTP single-send ceiling) but carries a
 * {@link SpriteSetUpdatePayload} — no image bytes. The receiver
 * reassembles by `transferId` and applies the descriptor in place
 * against the set it already has (an update for a set the peer lacks is
 * ignored — adds come via {@link SpriteSetAddChunkOp}).
 */
export interface SpriteSetUpdateChunkOp {
  kind: typeof SPRITESET_UPDATE_CHUNK_KIND
  payload: {
    /** Stable id grouping the chunks of one transfer (`<peerId>:<n>`). */
    transferId: string
    chunkIndex: number
    totalChunks: number
    /** Slice of the JSON-serialised {@link SpriteSetUpdatePayload}. */
    data: string
  }
  peerId: string
  seq: number
}

/**
 * Peer → peers: a sprite-set (tileset) was deleted from the project;
 * drop its reference by id. The image + descriptor files are removed
 * on each peer by the maker's CollabSession ↔ controller wiring — this
 * op carries only the id (the inverse of the chunked
 * {@link SpriteSetAddChunkOp} add). Coarse + idempotent like the
 * character ops: applying twice leaves the same state.
 */
export interface SpriteSetRemoveOp {
  kind: typeof SPRITESET_REMOVE_KIND
  payload: { spriteSetId: string }
  peerId: string
  seq: number
}

/**
 * The data a map creation carries to peers: the project-level
 * {@link MapReference} (id + relative `path` + display name) AND the
 * whole {@link MapData} that belongs at that path, because the receiver
 * has no other way to obtain the file — maps live in their own files
 * next to `game-project.json`, and there is no file-transfer channel.
 *
 * Also the vocabulary for DUPLICATE: a duplicate is a create whose
 * `mapData` is a deep copy of another map under a fresh id/path.
 */
export interface MapCreatePayload {
  reference: MapReference
  mapData: MapData
}

/**
 * Peer → peers: one chunk of a map-create transfer. Chunked for the
 * same reason as a sprite-set add: a real map's `layers` easily exceed
 * the SCTP single-send ceiling (the sample `kokiri-forest.json` is
 * 2.6 MB against a {@link SPRITESET_CHUNK_SIZE} of 16 KiB), and an
 * oversized send is dropped silently by `webrtcbin`. The receiver
 * reassembles by `transferId` — see {@link MapCreateReassembler}.
 */
export interface MapCreateChunkOp {
  kind: typeof MAP_CREATE_CHUNK_KIND
  payload: {
    /** Stable id grouping the chunks of one transfer (`<peerId>:<n>`). */
    transferId: string
    chunkIndex: number
    totalChunks: number
    /** Slice of the JSON-serialised {@link MapCreatePayload}. */
    data: string
  }
  peerId: string
  seq: number
}

/**
 * Peer → peers: a map was renamed. Carries the whole new name, keyed by
 * the map's stable id — coarse + idempotent like the other `__project/*`
 * ops. The receiver renames BOTH the project-level {@link MapReference}
 * and the live {@link MapData} (the two names are denormalised copies);
 * the map's `path` is NOT derived from the name, so no file moves.
 */
export interface MapRenameOp {
  kind: typeof MAP_RENAME_KIND
  payload: { mapId: string; name: string }
  peerId: string
  seq: number
}

/**
 * Peer → peers: a map was deleted from the project; drop its reference
 * by id. The map file is removed on each peer by the maker's
 * CollabSession ↔ ProjectStore wiring — this op carries only the id,
 * the inverse of the chunked {@link MapCreateChunkOp}. Applying it
 * repoints `startup.initialMapId` when it pointed at the deleted map,
 * because a project whose start map is missing fails validation.
 */
export interface MapRemoveOp {
  kind: typeof MAP_REMOVE_KIND
  payload: { mapId: string }
  peerId: string
  seq: number
}

/**
 * Peer → peers: the map the game starts on changed
 * (`startup.initialMapId`). Separate from {@link ProjectMetaUpdateOp}
 * because `startup` is its own block with a referential invariant —
 * `GameProjectFormat.validate` rejects a project whose
 * `startup.initialMapId` is not in `maps[]`, so this op is ignored for
 * a map the receiver does not have (rather than making the project
 * unsaveable on that peer).
 */
export interface StartupSetOp {
  kind: typeof STARTUP_SET_KIND
  payload: { initialMapId: string }
  peerId: string
  seq: number
}

export type ProjectOp =
  | EntityUpsertOp
  | EntityRemoveOp
  | PlayerSetOp
  | ProjectMetaUpdateOp
  | GameSystemsSetOp
  | MapEditorDataOp
  | MapCreateChunkOp
  | MapRenameOp
  | MapRemoveOp
  | StartupSetOp
  | SpriteSetAddChunkOp
  | SpriteSetUpdateChunkOp
  | SpriteSetRemoveOp

/**
 * Discriminator: is this raw op a project-level message that should be
 * routed AROUND both the command registry and the session-protocol
 * snapshot handler? Command/snapshot kinds return false.
 */
export function isProjectOp(rawOp: unknown): rawOp is ProjectOp {
  if (!rawOp || typeof rawOp !== 'object') return false
  const k = (rawOp as { kind?: unknown }).kind
  return typeof k === 'string' && k.startsWith(PROJECT_OP_PREFIX)
}

/** Build an entity-upsert envelope. */
export function createEntityUpsertOp(args: { peerId: string; seq: number; entity: EntityDefinition }): EntityUpsertOp {
  return {
    kind: ENTITY_UPSERT_KIND,
    payload: { entity: args.entity },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build an entity-remove envelope. */
export function createEntityRemoveOp(args: { peerId: string; seq: number; entityId: string }): EntityRemoveOp {
  return {
    kind: ENTITY_REMOVE_KIND,
    payload: { entityId: args.entityId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a player-set envelope. */
export function createPlayerSetOp(args: { peerId: string; seq: number; playerActorId: string | null }): PlayerSetOp {
  return {
    kind: PLAYER_SET_KIND,
    payload: { playerActorId: args.playerActorId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a project-meta-update envelope (whole name + properties bag). */
export function createProjectMetaUpdateOp(args: {
  peerId: string
  seq: number
  name: string
  properties: Properties
}): ProjectMetaUpdateOp {
  return {
    kind: PROJECT_META_UPDATE_KIND,
    payload: { name: args.name, properties: args.properties },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a game-systems envelope (the whole enabled-set record). */
export function createGameSystemsSetOp(args: {
  peerId: string
  seq: number
  gameSystems: NonNullable<GameProjectData['gameSystems']>
}): GameSystemsSetOp {
  return {
    kind: GAME_SYSTEMS_SET_KIND,
    payload: { gameSystems: args.gameSystems },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a map-editor-data envelope (partial patch keyed by map id). */
export function createMapEditorDataOp(args: {
  peerId: string
  seq: number
  mapId: string
  editorData: MapEditorData
}): MapEditorDataOp {
  return {
    kind: MAP_EDITOR_DATA_KIND,
    payload: { mapId: args.mapId, editorData: args.editorData },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/**
 * Apply an entity upsert to project data IN PLACE: replace the
 * `entityLibrary` entry with the same id, or append a new one.
 * Idempotent — applying the same op twice yields the same state.
 */
export function applyEntityUpsert(data: GameProjectData, entity: EntityDefinition): void {
  data.entityLibrary ??= []
  const library = data.entityLibrary
  const idx = library.findIndex((e) => e.id === entity.id)
  if (idx >= 0) library[idx] = entity
  else library.push(entity)
}

/** Remove an entity definition from project data IN PLACE by id. Idempotent. */
export function applyEntityRemove(data: GameProjectData, entityId: string): void {
  if (!data.entityLibrary) return
  data.entityLibrary = data.entityLibrary.filter((e) => e.id !== entityId)
  // A removed entity can't remain the player.
  if (data.playerActorId === entityId) data.playerActorId = undefined
}

/** Set the project's player actor IN PLACE. Idempotent. */
export function applyPlayerSet(data: GameProjectData, playerActorId: string | null): void {
  data.playerActorId = playerActorId ?? undefined
}

/**
 * Apply a project-meta update to project data IN PLACE: replace the
 * `name` and the WHOLE `properties` bag (coarse, like entity.upsert
 * replaces the whole entity). Idempotent — applying the same payload
 * twice yields the same state.
 */
export function applyProjectMetaUpdate(data: GameProjectData, payload: ProjectMetaUpdateOp['payload']): void {
  data.name = payload.name
  data.properties = { ...payload.properties }
}

/**
 * Replace the project's whole `gameSystems` record IN PLACE. Idempotent.
 *
 * Wholesale on purpose: an entry the sender does not have is an entry the
 * project no longer has. Note that this preserves `enabled: false`
 * entries — switching a system off is dormancy, not deletion, and the
 * record is what remembers it.
 */
export function applyGameSystemsSet(
  data: GameProjectData,
  gameSystems: NonNullable<GameProjectData['gameSystems']>,
): void {
  data.gameSystems = { ...gameSystems }
}

/**
 * Apply a map-editor-data patch to the map with the matching stable id
 * IN PLACE: shallow-merge the payload's partial {@link MapEditorData}
 * onto the map's `editorData` (keys present in the patch win, absent
 * keys stay). Idempotent. Returns the patched map so the caller can
 * persist it (the engine layer is filesystem-agnostic), or `null` when
 * no map matches — an op for a map this peer lacks is ignored.
 */
export function applyMapEditorData(maps: Iterable<MapData>, payload: MapEditorDataOp['payload']): MapData | null {
  for (const map of maps) {
    if (map.id !== payload.mapId) continue
    map.editorData = { ...map.editorData, ...payload.editorData }
    return map
  }
  return null
}

/** Build a map-rename envelope (whole new name, keyed by map id). */
export function createMapRenameOp(args: { peerId: string; seq: number; mapId: string; name: string }): MapRenameOp {
  return {
    kind: MAP_RENAME_KIND,
    payload: { mapId: args.mapId, name: args.name },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a map-remove envelope. */
export function createMapRemoveOp(args: { peerId: string; seq: number; mapId: string }): MapRemoveOp {
  return {
    kind: MAP_REMOVE_KIND,
    payload: { mapId: args.mapId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a startup-set envelope (the map the game starts on). */
export function createStartupSetOp(args: { peerId: string; seq: number; initialMapId: string }): StartupSetOp {
  return {
    kind: STARTUP_SET_KIND,
    payload: { initialMapId: args.initialMapId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/**
 * Add or replace a map reference in project data IN PLACE, keyed by id
 * (so re-applying a duplicate transfer is idempotent). The id and
 * `path` are kept verbatim so both peers end up with the same file
 * layout. The caller writes the `mapData` to that path (the engine
 * layer is filesystem-agnostic).
 *
 * Keeps the `startup.initialMapId ∈ maps[]` invariant: a project whose
 * start map does not resolve — the very first map of an empty project,
 * or one whose start map was deleted — starts on the new map.
 */
export function applyMapCreate(data: GameProjectData, reference: MapReference): void {
  data.maps ??= []
  const maps = data.maps
  const idx = maps.findIndex((m) => m.id === reference.id)
  if (idx >= 0) maps[idx] = reference
  else maps.push(reference)
  const startup = data.startup
  if (startup && !maps.some((m) => m.id === startup.initialMapId)) startup.initialMapId = reference.id
}

/**
 * Rename the map with the matching stable id IN PLACE — both the
 * project-level {@link MapReference} and, when the live map is loaded,
 * its {@link MapData.name}. Idempotent. Returns the renamed `MapData`
 * so the caller can persist the map file, or `null` when that map is
 * not loaded (the reference is still renamed — the project file is the
 * one that has to agree).
 */
export function applyMapRename(
  data: GameProjectData,
  maps: Iterable<MapData>,
  payload: MapRenameOp['payload'],
): MapData | null {
  for (const reference of data.maps ?? []) {
    if (reference.id === payload.mapId) reference.name = payload.name
  }
  for (const map of maps) {
    if (map.id !== payload.mapId) continue
    map.name = payload.name
    return map
  }
  return null
}

/**
 * Remove a map reference from project data IN PLACE by id. Idempotent —
 * returns `null` when the id isn't present. Does not touch the on-disk
 * map file; the caller deletes it (the engine layer is
 * filesystem-agnostic) using the returned reference's `path`.
 *
 * When the removed map was the start map, `startup.initialMapId` moves
 * to the first remaining map so the project still validates. Removing
 * the LAST map leaves a dangling `initialMapId` — callers must refuse
 * that case (the UI keeps Delete insensitive for a lone map).
 */
export function applyMapRemove(data: GameProjectData, mapId: string): MapReference | null {
  const maps = data.maps ?? []
  const removed = maps.find((m) => m.id === mapId)
  if (!removed) return null
  data.maps = maps.filter((m) => m.id !== mapId)
  const startup = data.startup
  if (startup && startup.initialMapId === mapId && data.maps[0]) startup.initialMapId = data.maps[0].id
  return removed
}

/**
 * Point `startup.initialMapId` at a map IN PLACE. Idempotent. Returns
 * false (and changes nothing) when the id is not among `data.maps` —
 * see {@link StartupSetOp} for why an unknown map is ignored rather
 * than trusted.
 */
export function applyStartupSet(data: GameProjectData, initialMapId: string): boolean {
  if (!data.startup) return false
  if (!(data.maps ?? []).some((m) => m.id === initialMapId)) return false
  data.startup.initialMapId = initialMapId
  return true
}

/** Build a sprite-set-remove envelope. */
export function createSpriteSetRemoveOp(args: { peerId: string; seq: number; spriteSetId: string }): SpriteSetRemoveOp {
  return {
    kind: SPRITESET_REMOVE_KIND,
    payload: { spriteSetId: args.spriteSetId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/**
 * Remove a sprite-set reference from project data IN PLACE by id.
 * Idempotent — a no-op when the id isn't present. Does not touch the
 * on-disk image/descriptor files; the caller deletes those (the engine
 * layer is filesystem-agnostic).
 */
export function applySpriteSetRemove(data: GameProjectData, spriteSetId: string): void {
  if (!data.spriteSets) return
  data.spriteSets = data.spriteSets.filter((s) => s.id !== spriteSetId)
}

/** The shared body of every chunked project-op (add + update). */
type ChunkBody = ChunkEnvelope

/**
 * Slice a JSON string into ordered {@link ChunkBody} envelopes tagged
 * with `kind` (without the per-op `peerId`/`seq`, which the transport
 * stamps). Always emits at least one chunk so an empty/tiny payload
 * still round-trips. `transferId` groups the chunks for reassembly.
 */
function buildChunks<K extends string>(
  kind: K,
  transferId: string,
  json: string,
): Array<{ kind: K; payload: ChunkBody }> {
  return buildChunkEnvelopes(transferId, json, SPRITESET_CHUNK_SIZE).map((payload) => ({ kind, payload }))
}

/**
 * Slice a {@link SpriteSetAddPayload} into ordered chunk-op bodies.
 * See {@link buildChunks}.
 */
export function chunkSpriteSetAdd(args: {
  transferId: string
  payload: SpriteSetAddPayload
}): Array<Omit<SpriteSetAddChunkOp, 'peerId' | 'seq'>> {
  return buildChunks(SPRITESET_ADD_CHUNK_KIND, args.transferId, JSON.stringify(args.payload))
}

/**
 * Slice a {@link SpriteSetUpdatePayload} (descriptor-only — no image
 * bytes) into ordered chunk-op bodies. Mirrors {@link chunkSpriteSetAdd}
 * but tags the chunks {@link SPRITESET_UPDATE_CHUNK_KIND}.
 */
export function chunkSpriteSetUpdate(args: {
  transferId: string
  payload: SpriteSetUpdatePayload
}): Array<Omit<SpriteSetUpdateChunkOp, 'peerId' | 'seq'>> {
  return buildChunks(SPRITESET_UPDATE_CHUNK_KIND, args.transferId, JSON.stringify(args.payload))
}

/**
 * Slice a {@link MapCreatePayload} (reference + the whole map) into
 * ordered chunk-op bodies. See {@link buildChunks}.
 */
export function chunkMapCreate(args: {
  transferId: string
  payload: MapCreatePayload
}): Array<Omit<MapCreateChunkOp, 'peerId' | 'seq'>> {
  return buildChunks(MAP_CREATE_CHUNK_KIND, args.transferId, JSON.stringify(args.payload))
}

/**
 * Accumulates chunk ops by `transferId` until a transfer is complete,
 * then returns the parsed payload of type `T`. Thin adapter over the
 * shared validated {@link SharedChunkReassembler} (`chunking.ts`):
 * protocol violations (malformed envelope, mid-stream `totalChunks`
 * change, parse failure) are logged via `console.warn` and the
 * transfer is dropped — project-ops are best-effort upserts, so
 * "warn + wait for the next full re-send" beats failing the session.
 */
export class OpChunkReassembler<T> {
  private readonly inner = new SharedChunkReassembler<T>()

  /** Feed one chunk; returns the payload once the last chunk arrives, else null. */
  accept(op: { payload: ChunkBody }): T | null {
    const result = this.inner.accept(op.payload)
    if (result.status === 'done') return result.payload
    if (result.status === 'error') {
      console.warn(`[project-operations] dropped chunked transfer: ${result.reason}`)
    }
    return null
  }

  /** Drop any partially-received transfers (e.g. on session close). */
  clear(): void {
    this.inner.clear()
  }
}

/**
 * Reassembles {@link SpriteSetAddChunkOp}s into a {@link SpriteSetAddPayload}.
 * Thin alias over {@link OpChunkReassembler} kept for call-site clarity at
 * the sprite-set add path.
 */
export class SpriteSetAddReassembler extends OpChunkReassembler<SpriteSetAddPayload> {}

/**
 * Reassembles {@link MapCreateChunkOp}s into a {@link MapCreatePayload}.
 * Thin alias over {@link OpChunkReassembler} kept for call-site clarity
 * at the map-create path.
 */
export class MapCreateReassembler extends OpChunkReassembler<MapCreatePayload> {}

/**
 * Add or replace a sprite-set reference in project data IN PLACE,
 * keyed by id (so re-applying is idempotent). The id is kept verbatim
 * so characters that reference the set still resolve on the peer.
 */
export function applySpriteSetReference(data: GameProjectData, reference: SpriteSetReference): void {
  data.spriteSets ??= []
  const sets = data.spriteSets
  const idx = sets.findIndex((s) => s.id === reference.id)
  if (idx >= 0) sets[idx] = reference
  else sets.push(reference)
}

/**
 * Merge an inbound sprite-set DESCRIPTOR update into the locally-held
 * descriptor: take the peer's data wholesale (name, animations,
 * `sprites[].solid`/`tileProperties`, …) but pin the image to the local
 * one — an update never carries image bytes (the `<id>.png` on disk is
 * unchanged) and a peer must not be able to repoint our image file.
 * Pure + idempotent; the caller swaps the result into its live resource
 * and persists.
 */
export function applySpriteSetUpdate(local: SpriteSetData, payload: SpriteSetUpdatePayload): SpriteSetData {
  return { ...payload.data, image: local.image ?? payload.data.image }
}
