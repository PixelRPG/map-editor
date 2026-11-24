import { Component } from 'excalibur'
import type { FlagValue } from '../types/data/EntityDefinition.ts'
import type { FlagData } from '../types/data/FlagData.ts'

/**
 * The record's shape version. Bumped when a reader would need to know
 * which build wrote it; `1` is the world/player split itself.
 */
export const SAVE_RECORD_VERSION = 1

/**
 * The player id a host that supplies none gets. One local player is
 * still a player: the browser host and every headless spec land here,
 * and a record with one key is the same shape as a record with four.
 */
export const LOCAL_PLAYER_ID = 'local'

/** Game-scoped flag values, by flag id: one memory for everyone. */
export type FlagValues = Record<string, FlagValue>

/**
 * What belongs to the game rather than to a person — and therefore what
 * the host owns in a session with peers (see
 * `docs/concepts/collaboration-and-multiplayer.md`).
 */
export interface WorldRecord {
  /** `scope: 'game'` flag values, by flag id. */
  flags: FlagValues
  /**
   * `scope: 'thing'` flag values: placement id → flag id → value. Keyed
   * by `ObjectPlacement.id` (the {@link PlacementIdComponent} id), so
   * two chests built from one definition are two memories under one
   * flag — which is the whole point of the scope.
   */
  things: Record<string, FlagValues>
  /** Placement ids the world no longer shows (a chest taken, a rock smashed). */
  removedThings: string[]
}

/**
 * What belongs to one person. Position today; the bag and live hit
 * points join it when their systems ship (M5) — a field nothing writes
 * is a field that drifts, so they are absent until then.
 */
export interface PlayerRecord {
  /** The map this player is on; `null` before the first spawn. */
  mapId: string | null
  tileX: number | null
  tileY: number | null
  facing: string | null
}

/**
 * The playthrough's save record: one world, many players.
 *
 * Design: `docs/concepts/save-record.md`.
 */
export interface GameSaveRecord {
  schemaVersion: number
  world: WorldRecord
  players: Record<string, PlayerRecord>
}

/** A player record before that player has ever spawned. */
export function emptyPlayerRecord(): PlayerRecord {
  return { mapId: null, tileX: null, tileY: null, facing: null }
}

/** A record with nothing remembered yet. */
export function emptySaveRecord(): GameSaveRecord {
  return { schemaVersion: SAVE_RECORD_VERSION, world: { flags: {}, things: {}, removedThings: [] }, players: {} }
}

/**
 * The value of every declared flag at the start of a playthrough, by id.
 *
 * Thing-scoped flags are listed here too: the value is what a placement
 * that has never written falls back to, which is what
 * {@link resolvedFlagView} layers under a placement's own entry.
 */
export function initialFlagValues(flags: readonly FlagData[] | undefined): FlagValues {
  const out: FlagValues = {}
  for (const flag of flags ?? []) out[flag.id] = flag.initial
  return out
}

/** A fresh record for a project whose flags are `flags`. */
export function initialSaveRecord(flags: readonly FlagData[] | undefined): GameSaveRecord {
  const record = emptySaveRecord()
  record.world.flags = initialFlagValues(flags)
  return record
}

/**
 * The old flat shape: `{ flags: Record<flagId, FlagValue> }` — no
 * `world`, no `players`, no `schemaVersion`.
 */
interface LegacySaveRecord {
  flags?: unknown
}

/**
 * Read any record this or an older build wrote into the current shape.
 *
 * Lossless and idempotent, the contract `format/migrate-flags.ts` holds
 * for the flag-name → flag-id bridge: a flat bag becomes `world.flags`
 * verbatim, a record that already has `schemaVersion` is returned with
 * only its missing containers filled in. Nothing is dropped and nothing
 * is renamed, so a reader never has to decide whether a value it does
 * not recognise was a flag.
 */
export function migrateSaveRecord(value: unknown): GameSaveRecord {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return emptySaveRecord()
  const raw = value as Partial<GameSaveRecord> & LegacySaveRecord
  const out = emptySaveRecord()
  // A newer build's record keeps its version: a reader reads what it
  // understands and leaves the rest alone rather than rewriting it down.
  if (typeof raw.schemaVersion === 'number') out.schemaVersion = raw.schemaVersion
  // The flat bag and the new `world.flags` are the same values under two
  // names; a record carrying both prefers `world`, which is the one this
  // build writes.
  out.world.flags = { ...flagValuesOf(raw.flags), ...flagValuesOf(raw.world?.flags) }
  const things = raw.world?.things
  if (things != null && typeof things === 'object' && !Array.isArray(things)) {
    for (const [placementId, values] of Object.entries(things as Record<string, unknown>)) {
      out.world.things[placementId] = flagValuesOf(values)
    }
  }
  if (Array.isArray(raw.world?.removedThings)) {
    out.world.removedThings = raw.world.removedThings.filter((id): id is string => typeof id === 'string')
  }
  const players = raw.players
  if (players != null && typeof players === 'object' && !Array.isArray(players)) {
    for (const [playerId, record] of Object.entries(players as Record<string, unknown>)) {
      out.players[playerId] = playerRecordOf(record)
    }
  }
  return out
}

function flagValuesOf(value: unknown): FlagValues {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: FlagValues = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const t = typeof v
    if (t === 'boolean' || t === 'string' || (t === 'number' && Number.isFinite(v))) out[key] = v as FlagValue
  }
  return out
}

function playerRecordOf(value: unknown): PlayerRecord {
  const out = emptyPlayerRecord()
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return out
  const raw = value as Record<string, unknown>
  if (typeof raw.mapId === 'string') out.mapId = raw.mapId
  if (typeof raw.tileX === 'number' && Number.isFinite(raw.tileX)) out.tileX = raw.tileX
  if (typeof raw.tileY === 'number' && Number.isFinite(raw.tileY)) out.tileY = raw.tileY
  if (typeof raw.facing === 'string') out.facing = raw.facing
  return out
}

/**
 * What one placement sees: the world's game-scoped values with that
 * placement's thing-scoped values layered on top.
 *
 * This is the view `StateSystem` hands the pure `evaluateCondition`, and
 * the reason that function stays ignorant of placements, scopes and the
 * ECS — it reads `state.flags` and nothing else, which is what keeps it
 * usable from the editor with no engine running.
 *
 * `placementId` `null` (an entity that is not a placement) yields the
 * world's values unlayered: a thing-scoped flag read with no owner falls
 * back to the shared value, which is what every build did before the
 * split.
 */
export function resolvedFlagView(world: WorldRecord, placementId: string | null): Readonly<FlagValues> {
  const own = placementId == null ? undefined : world.things[placementId]
  if (!own) return world.flags
  return { ...world.flags, ...own }
}

/**
 * The save half of a runtime snapshot: what a playtest driver reads back
 * over D-Bus `GetStatus` → `runtime`.
 *
 * Deliberately a copy all the way down. A driver holds a snapshot across
 * frames and compares it with the next one; handing out the live record
 * would make both reads the same object and every comparison pass.
 *
 * `flags` keeps the flat game-scoped shape every existing driver reads,
 * and the rest of the record sits beside it rather than inside it — see
 * `docs/concepts/save-record.md`.
 */
export interface SaveSnapshot {
  flags: FlagValues
  thingFlags: Record<string, FlagValues>
  removedThings: string[]
  players: Record<string, PlayerRecord>
  localPlayerId: string
}

/** Read {@link GameSaveRecord} out as a {@link SaveSnapshot}; `null` reads as empty. */
export function saveSnapshot(record: GameSaveRecord | undefined | null, localPlayerId: string): SaveSnapshot {
  const source = record ?? emptySaveRecord()
  return {
    flags: { ...source.world.flags },
    thingFlags: Object.fromEntries(Object.entries(source.world.things).map(([id, values]) => [id, { ...values }])),
    removedThings: [...source.world.removedThings],
    players: Object.fromEntries(Object.entries(source.players).map(([id, player]) => [id, { ...player }])),
    localPlayerId,
  }
}

/**
 * The playthrough's save state, on the session singleton.
 *
 * It holds the **save record**: `world` — the flag values `set-flag`
 * actions write and `EntityState.when` conditions read, the per-placement
 * values a `scope: 'thing'` flag resolves to, and the things the world no
 * longer shows — plus `players[playerId]`, where each person's position
 * lives. The split is what lets "the gate is open" be one fact for
 * everyone while "where I am standing" is one fact per person, and what
 * makes "who may write this" a question with an answer once peers join.
 *
 * Runtime state, deliberately not persisted: a playtest starts from the
 * project's `initial` values. Writing the record to disk is a separate
 * round — see `docs/concepts/save-record.md`.
 *
 * Live hit points and the inventory bag join `players[id]` as their
 * owning game systems ship; see `docs/concepts/game-systems.md`.
 */
export class GameSaveStateComponent extends Component {
  public readonly record: GameSaveRecord

  /**
   * Built from a record (normally {@link initialSaveRecord}), or empty.
   * Anything a previous build may have written goes through
   * {@link migrateSaveRecord} first, so the component never holds a
   * half-shaped record.
   */
  constructor(record?: GameSaveRecord | FlagValues) {
    super()
    this.record = record === undefined ? emptySaveRecord() : migrateSaveRecord(record)
  }

  /** The world half: everyone's memory. */
  public get world(): WorldRecord {
    return this.record.world
  }

  /** Every player's record, by player id. */
  public get players(): Record<string, PlayerRecord> {
    return this.record.players
  }

  /**
   * Game-scoped flag values. Kept as `flags` because that is what the
   * runtime snapshot, the playtest drivers and the condition docs have
   * always called this bag; it is `record.world.flags`, not a copy.
   */
  public get flags(): FlagValues {
    return this.record.world.flags
  }

  /** `players[playerId]`, created empty on first ask. */
  public playerRecord(playerId: string): PlayerRecord {
    const existing = this.record.players[playerId]
    if (existing) return existing
    const fresh = emptyPlayerRecord()
    this.record.players[playerId] = fresh
    return fresh
  }
}
