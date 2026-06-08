/**
 * Project-operation message kinds — reliable-channel messages that
 * mutate PROJECT-LEVEL data (the cast: `characters[]`) rather than
 * scene/map state. The `__project/` prefix is the discriminator that
 * keeps them OUT of the command registry (they aren't `Command`s —
 * they don't operate on a `Scene`) and out of the session-protocol
 * snapshot path.
 *
 * Why a separate channel rather than a `Command`:
 *   - `Command.apply(scene)` only gets a `Scene`; project metadata
 *     (characters, sprite-sets) lives on the `GameProjectResource`,
 *     not the scene. Commands can't reach it.
 *   - Cast editing happens in the Cast view, where there is NO live
 *     engine/scene at all (the engine only exists inside the scene
 *     editor). So the command/op-log path isn't even attached.
 * These ops therefore ride the always-present `PeerSession` op channel
 * and are applied directly to each peer's `GameProjectData` by the
 * maker's CollabSession ↔ CastController wiring — see
 * `docs/concepts/collaboration-and-multiplayer.md`.
 *
 * Coarse-grained UPSERT semantics (rather than one op per editable
 * field) keep the surface small + the apply idempotent: every cast
 * mutation (rename / set-player / set-speed / add-or-edit animation /
 * create) re-sends the whole affected {@link CharacterDefinition};
 * the receiver replaces-by-id. A remove op carries just the id.
 *
 * Naming mirrors `session-protocol.ts`: `__`-prefixed, kinds use `.`
 * after the prefix segment (`__project/character.upsert`). Any future
 * `__project/*` kind an older peer doesn't recognise is ignored, same
 * forward-compat contract as session-protocol.
 */

import type { CharacterDefinition, GameProjectData, SpriteSetData, SpriteSetReference } from '../types/index.ts'

export const PROJECT_OP_PREFIX = '__project/'
export const CHARACTER_UPSERT_KIND = '__project/character.upsert'
export const CHARACTER_REMOVE_KIND = '__project/character.remove'
export const SPRITESET_ADD_CHUNK_KIND = '__project/spriteset.add.chunk'
export const SPRITESET_REMOVE_KIND = '__project/spriteset.remove'

/**
 * Per-chunk payload budget for a sprite-set transfer (chars of the
 * JSON-serialised {@link SpriteSetAddPayload}). 16 KiB matches the
 * snapshot-chunk size in `session-protocol.ts` — well under the WebRTC
 * SCTP `max-message-size` ceiling (RFC 8841 default 64 KiB), above
 * which `webrtcbin` silently drops the send.
 */
export const SPRITESET_CHUNK_SIZE = 16 * 1024

/** Peer → peers: a character was created or edited; replace it by id. */
export interface CharacterUpsertOp {
  kind: typeof CHARACTER_UPSERT_KIND
  payload: { character: CharacterDefinition }
  peerId: string
  /** Per-peer monotonic sequence. Same envelope shape as a normal Operation. */
  seq: number
}

/** Peer → peers: a character was removed; drop it by id. */
export interface CharacterRemoveOp {
  kind: typeof CHARACTER_REMOVE_KIND
  payload: { characterId: string }
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

export type ProjectOp = CharacterUpsertOp | CharacterRemoveOp | SpriteSetAddChunkOp | SpriteSetRemoveOp

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

/** Build a character-upsert envelope. */
export function createCharacterUpsertOp(args: {
  peerId: string
  seq: number
  character: CharacterDefinition
}): CharacterUpsertOp {
  return {
    kind: CHARACTER_UPSERT_KIND,
    payload: { character: args.character },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a character-remove envelope. */
export function createCharacterRemoveOp(args: { peerId: string; seq: number; characterId: string }): CharacterRemoveOp {
  return {
    kind: CHARACTER_REMOVE_KIND,
    payload: { characterId: args.characterId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/**
 * Apply a character upsert to project data IN PLACE: replace the entry
 * with the same id, or append a new one. When the upserted character
 * is the player, clears `isPlayer` on every other character so the
 * single-player invariant survives the wire (mirrors the local
 * `CastController` enforcement). Idempotent — applying the same op
 * twice yields the same state.
 */
export function applyCharacterUpsert(data: GameProjectData, character: CharacterDefinition): void {
  const characters = (data.characters ??= [])
  if (character.isPlayer) {
    for (const c of characters) {
      if (c.id !== character.id) c.isPlayer = false
    }
  }
  const idx = characters.findIndex((c) => c.id === character.id)
  if (idx >= 0) characters[idx] = character
  else characters.push(character)
}

/** Remove a character from project data IN PLACE by id. Idempotent. */
export function applyCharacterRemove(data: GameProjectData, characterId: string): void {
  if (!data.characters) return
  data.characters = data.characters.filter((c) => c.id !== characterId)
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

/**
 * Slice a {@link SpriteSetAddPayload} into ordered chunk-op bodies
 * (without the per-op `peerId`/`seq`, which the transport stamps).
 * Always emits at least one chunk so an empty/tiny payload still
 * round-trips. `transferId` groups the chunks for reassembly.
 */
export function chunkSpriteSetAdd(args: {
  transferId: string
  payload: SpriteSetAddPayload
}): Array<Omit<SpriteSetAddChunkOp, 'peerId' | 'seq'>> {
  const json = JSON.stringify(args.payload)
  const totalChunks = Math.max(1, Math.ceil(json.length / SPRITESET_CHUNK_SIZE))
  const ops: Array<Omit<SpriteSetAddChunkOp, 'peerId' | 'seq'>> = []
  for (let i = 0; i < totalChunks; i++) {
    ops.push({
      kind: SPRITESET_ADD_CHUNK_KIND,
      payload: {
        transferId: args.transferId,
        chunkIndex: i,
        totalChunks,
        data: json.slice(i * SPRITESET_CHUNK_SIZE, (i + 1) * SPRITESET_CHUNK_SIZE),
      },
    })
  }
  return ops
}

/**
 * Accumulates {@link SpriteSetAddChunkOp}s by `transferId` until a
 * transfer is complete, then returns the parsed payload. Indexes by
 * `chunkIndex` (not arrival order) so a re-sent chunk or a future
 * unordered channel is safe. Drops the buffer once a transfer
 * completes or fails to parse.
 */
export class SpriteSetAddReassembler {
  private readonly transfers = new Map<string, { chunks: Map<number, string>; total: number }>()

  /** Feed one chunk; returns the payload once the last chunk arrives, else null. */
  accept(op: SpriteSetAddChunkOp): SpriteSetAddPayload | null {
    const { transferId, chunkIndex, totalChunks, data } = op.payload
    let entry = this.transfers.get(transferId)
    if (!entry) {
      entry = { chunks: new Map(), total: totalChunks }
      this.transfers.set(transferId, entry)
    }
    entry.chunks.set(chunkIndex, data)
    if (entry.chunks.size < entry.total) return null
    this.transfers.delete(transferId)
    let json = ''
    for (let i = 0; i < entry.total; i++) json += entry.chunks.get(i) ?? ''
    try {
      return JSON.parse(json) as SpriteSetAddPayload
    } catch {
      return null
    }
  }

  /** Drop any partially-received transfers (e.g. on session close). */
  clear(): void {
    this.transfers.clear()
  }
}

/**
 * Add or replace a sprite-set reference in project data IN PLACE,
 * keyed by id (so re-applying is idempotent). The id is kept verbatim
 * so characters that reference the set still resolve on the peer.
 */
export function applySpriteSetReference(data: GameProjectData, reference: SpriteSetReference): void {
  const sets = (data.spriteSets ??= [])
  const idx = sets.findIndex((s) => s.id === reference.id)
  if (idx >= 0) sets[idx] = reference
  else sets.push(reference)
}
