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

import type { CharacterDefinition, GameProjectData } from '../types/index.ts'

export const PROJECT_OP_PREFIX = '__project/'
export const CHARACTER_UPSERT_KIND = '__project/character.upsert'
export const CHARACTER_REMOVE_KIND = '__project/character.remove'

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

export type ProjectOp = CharacterUpsertOp | CharacterRemoveOp

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
export function createCharacterRemoveOp(args: {
  peerId: string
  seq: number
  characterId: string
}): CharacterRemoveOp {
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
