# The Save Record — world, players, things

> Status: tracked in the [phase tracker](#phase-tracker) — the single source of truth for what's landed vs planned.

A playthrough remembers three different kinds of thing, and before this design it remembered them
in one flat bag. `GameSaveStateComponent.flags` was `Record<flagId, FlagValue>`: "the door is
unlocked" and "this chest is open" lived side by side, keyed only by the flag's id. That works
until the second chest.

Two chests both set the flag "Chest is open". In one bag they are the same memory: opening the
first opens the second. The author's repair is to declare one flag per chest — `chest-open-1`,
`chest-open-2`, … — which is a global name for a local fact, and it does not scale past the first
dungeon. `FlagData.scope` has carried `'thing'` since flags became project data precisely so this
could be fixed without a file-format change; until now the runtime treated `'thing'` exactly like
`'game'`.

The second thing the flat bag cannot hold is a **second player**. Collaboration and multiplayer
(see [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md)) put more than one hero
in one world. "The gate is open" is one fact for everyone; "where I am standing" is one fact per
person. A single `Record<string, FlagValue>` has no place to say which.

This document decides the shape that separates them.

## The record

```ts
interface GameSaveRecord {
  schemaVersion: number
  world: WorldRecord
  players: Record<string, PlayerRecord>
}

interface WorldRecord {
  /** Game-scoped flag values, by flag id. One memory for everyone. */
  flags: Record<string, FlagValue>
  /** Thing-scoped flag values: placement id → flag id → value. */
  things: Record<string, Record<string, FlagValue>>
  /** Placement ids the world no longer shows (a chest taken, a rock smashed). */
  removedThings: string[]
}

interface PlayerRecord {
  /** The map this player is on; `null` before the first spawn. */
  mapId: string | null
  tileX: number | null
  tileY: number | null
  facing: string | null
}
```

Three deliberate properties:

- **`world` is one thing, `players` is many.** Every fact that belongs to the game rather than to a
  person is in `world`, keyed by nothing but itself. Every fact that belongs to a person is under
  that person's id. There is no third place, and nothing is duplicated between them.
- **Thing-scoped values are keyed by `ObjectPlacement.id`,** the stable per-placement id the
  `PlacementIdComponent` carries. Two chests built from the same library definition are two keys in
  `world.things`, so one flag id — "Chest is open" — is enough for the whole game. This is the
  workspace's stable-identifier rule (`AGENTS.md` § Transport-ready primitives) applied to save
  state: Excalibur's runtime `Entity.id` is never a save or wire key.
- **A thing's values are in `world`, not in a player's record.** Whether a chest is open is a fact
  about the world; two players walking into the same room must see the same chest. The alternative
  (per-player thing state, so each player opens their own copy) is a game-design choice some games
  want, and it would be a per-flag property rather than a different record — out of scope here, and
  nothing in this shape forecloses it.

### `schemaVersion`

`schemaVersion` is on the record because the record is what a save file will contain (M8), and a
save written by one build is read by another. It is `1` today. A reader that finds a higher number
reads what it understands and leaves the rest untouched, the same discipline `GameProjectData`
already follows for a component type from a newer build: reduced behaviour, never an error, never a
rewrite that loses the part it did not understand.

## Who writes what

| Field | Writer | Through |
|---|---|---|
| `world.flags` | `FlagSystem` | `FLAG_SET` without a `thing` |
| `world.things[placementId][flagId]` | `FlagSystem` | `FLAG_SET` carrying `thing` |
| `world.removedThings` | — (M6; the field exists and is read) | — |
| `players[id].mapId/tileX/tileY/facing` | `PlayerSystem` | its own tile-change pass |

**The host owns `world`.** In a session with peers, the host is the only peer that writes
`world.flags` and `world.things`; other peers receive the result. That is the host-authoritative
rule the game op vocabulary already states for `object.removed` and `item.granted`, and the split
is what makes it expressible: before it, a peer writing its own position and a peer writing a world
flag were the same write to the same bag. A player's own record is written by the peer that plays
that player and broadcast as `player.moved`; the host validates it.

None of that replication is wired yet — phase 6 of the collab plan. What lands here is the shape it
needs, and the single writer per field that makes "who is allowed to write this" a question with an
answer.

## How `scope: thing` resolves

The flag's **definition** says which memory a reference means; the **placement** says which copy.

1. `set-flag` runs inside an action list, and an action list is attached to the entity whose trigger
   fired (`ActionRunComponent`, see [`action-sequencer.md`](action-sequencer.md)). `EventActionSystem`
   reads that entity's `PlacementIdComponent` and puts it on the event: `FLAG_SET` and
   `COUNTER_CHANGED` carry an optional `thing`.
2. `FlagSystem` looks the flag up in the project's flag list. `scope: 'game'` → `world.flags`.
   `scope: 'thing'` **with** a `thing` id → `world.things[thing]`. `scope: 'thing'` with no `thing`
   id (a run on an entity that is not a placement) falls back to `world.flags`, which is what the
   build did for every thing-scoped flag until now: a write with no owner is better in the world
   than dropped.
3. `StateSystem` resolves per entity. For each entity it builds the **view** that entity sees —
   `world.flags` with that placement's `world.things` entry layered on top, and each thing-scoped
   flag the placement has never written falling back to the flag's `initial` — and hands the view to
   `evaluateCondition`.

`evaluateCondition` stays pure and stays ignorant: it takes `ConditionState` and reads
`state.flags`. It does not know about placements, scopes or the ECS, which is what keeps it usable
from the editor (the condition summary, "Used in") with no engine running.

The cost of the layering is one small record per entity per tick, and it is paid only by entities
that have states. The alternative — handing `evaluateCondition` a resolver callback — was rejected:
it makes a pure total function depend on something that can throw.

## Migration

The old shape is `{ flags: Record<string, FlagValue> }` — no `world`, no `players`, no
`schemaVersion`. `migrateSaveRecord` reads it into `world.flags` verbatim and adds the empty
`things`, `removedThings` and `players`. Nothing is dropped and nothing is renamed, so the
migration is lossless and idempotent (a record that already has `schemaVersion` is returned
unchanged), the same contract `format/migrate-flags.ts` holds for the flag-name → flag-id bridge.

There is no save file yet, so today the migration has exactly one real caller: a `runtime` snapshot
or an in-memory record built by an older build in the same process. It ships with the shape rather
than after it, because the first thing M8 does is read a file some build wrote.

One behaviour change is not a migration and is named instead: a project whose flag is declared
`scope: 'thing'` used to get one global value and now gets one value per placement. That is the bug
this round fixes. A project that relied on the old behaviour — one flag, one value, several things
— declares the flag `scope: 'game'`, which is what it always meant.

## The runtime snapshot

`Engine.getRuntimeSnapshot()` feeds the D-Bus `GetStatus` `runtime` field a playtest driver reads.
It keeps `flags` as the flat game-scoped bag it always was, so every existing driver and spec reads
unchanged, and gains the rest of the record:

```ts
interface RuntimeSnapshot {
  flags: Record<string, unknown>            // === save.world.flags
  thingFlags: Record<string, Record<string, unknown>>
  removedThings: string[]
  players: Record<string, PlayerRecord>
  playerTile: { x: number; y: number } | null   // the local player, as before
  // … dialogue, ask, input, facing as before
}
```

`playerTile` stays: it is read off the live actor, it is what every playtest asserts on, and it is
the local player. `players` is the record, which is the thing a second player will appear in.

## What M5 and M8 add

- **M5 — the bag.** An inventory is per player: `PlayerRecord` gains `bag`, and the `has-item`
  condition (stored, editable, always `false` today) starts reading it through the same resolved
  view, so `give-item` becomes a write to the acting player's record rather than to the world. Live
  hit points join it there (`StatsRuntimeComponent` is the per-actor live block today and states the
  same not-persisted rule).
- **M8 — saving at rest.** The record is what gets written. "At rest" is already defined by the
  action sequencer: no blocking run is active, so `frames` and `pending` never reach the file and
  the step vocabulary stays out of the save format. `schemaVersion` is what makes a file a file
  rather than a dump, and `world`/`players` is what makes "continue on another machine" and "a
  second player joins a saved world" the same read.

Neither is built here. The fields they need are named above and absent from the type until their
system ships: a field nothing writes is a field that drifts.

## Phase tracker

| # | Scope | Status |
|---|---|---|
| 1 | `GameSaveRecord` on the session singleton — `world.flags` + `world.things` + `players`, `schemaVersion`, lossless migration from the flat bag | **landed** |
| 2 | `scope: 'thing'` resolves per placement id — `FLAG_SET`/`COUNTER_CHANGED` carry `thing`, `StateSystem` layers the view | **landed** |
| 3 | `scope` selectable in the editor's new-flag dialog | **landed** |
| 4 | Player id from the host (`player-id`, GSettings), `players[id]` written by `PlayerSystem` | **landed** (one local player) |
| 5 | `world.removedThings` written — a taken chest stays taken | planned (M6) |
| 6 | `PlayerRecord.bag` + `has-item` reading it; live hit points in the record | planned (M5) |
| 7 | Saving the record at rest, and reading a file a newer build wrote | planned (M8) |
| 8 | Host-authoritative replication of `world`; `player.moved` for each player's record | planned (collab phase 6) |

## The player id

A player's record is keyed by an id that must be **stable across runs** — the whole point of
`players[id]` is that the same person comes back to the same position — and must **not** be a peer
id: `generatePeerId()` in `session-service.ts` is fresh per session, so keying on it would file
every run under a new player.

The id is therefore a fact about the device, supplied by the **host** and not invented by the
engine, exactly as the play locale is: `Engine.setLocalPlayerId` → `ProjectLoaderHost.localPlayerId()`
→ `MapSceneOptions.localPlayerId` → `GameSystemRuntimeContext.localPlayerId`. The engine's default
is the literal `'local'` (`LOCAL_PLAYER_ID`), so a host that supplies nothing — the browser host, a
headless spec — still gets a valid record with one player in it.

The GJS maker supplies it from a new GSettings key, `player-id`, defaulting to the empty string and
filled with a generated UUID the first time it is read (`playerIdentity()` in
`apps/maker-gjs/src/services/player-identity.ts`). Empty-default-then-write is the pattern
`collab-name` and `collab-colour` already use and for the same reason: a value written at install
time freezes a fact about a machine into the settings of a user who never chose it.

It is deliberately **not** the collaboration display name. The name is what others see and is
changed freely; the player id is what the save is keyed on and must never change. Two keys because
they have two lifetimes.

## Where this is implemented

- **The record** — `packages/engine/src/components/game-save-state.component.ts`:
  `GameSaveRecord`, `WorldRecord`, `PlayerRecord`, `SAVE_RECORD_VERSION`, `LOCAL_PLAYER_ID`,
  `emptySaveRecord`, `initialFlagValues`, `migrateSaveRecord`, `resolvedFlagView`.
- **The writers** — `systems/flag.system.ts` (world + thing flag values, routed by the flag's
  scope), `systems/player.system.ts` (the local player's map, tile and facing).
- **The reader** — `systems/state.system.ts` builds one resolved view per entity and hands it to the
  pure `evaluateCondition` (`types/data/Condition.ts`).
- **The owning placement** — `systems/event-action.system.ts` reads `PlacementIdComponent` off the
  entity the run is attached to and puts it on `FLAG_SET` / `COUNTER_CHANGED`
  (`types/engine-events.ts`).
- **The player id** — `engine.ts` (`setLocalPlayerId`), `engine/project-loader.ts`,
  `scenes/map.scene.ts`, `game-systems/game-system-spec.ts`,
  `apps/maker-gjs/src/services/player-identity.ts`, `apps/maker-gjs/data/org.pixelrpg.maker.gschema.xml`.
- **The snapshot** — `engine.ts` `RuntimeSnapshot` + `getRuntimeSnapshot`, surfaced on D-Bus
  `GetStatus` by `apps/maker-gjs/src/widgets/application-window.ts`.
- **Specs** — `components/game-save-state.component.spec.ts` (shape, migration, resolved view),
  `systems/state.system.spec.ts` (two placements, two players, the snapshot).

## Related concepts

- [`game-systems.md`](game-systems.md) — the flag store and conditional states the base layer ships;
  `FlagData.scope` is declared there as project data.
- [`action-sequencer.md`](action-sequencer.md) — the run the `set-flag` step lives in, and the "at
  rest" definition M8 saves against.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — who owns `world`, and the
  `player.moved` / `object.removed` ops the record is the state behind.
- [`object-system.md`](object-system.md) — `ObjectPlacement.id`, the key `world.things` is built on.

## Open questions

- **Per-player thing state.** Some games want each player to open their own copy of a chest. That is
  a third scope rather than a different record (`scope: 'thing-per-player'` →
  `players[id].things[placementId]`). Nothing here forecloses it; nothing asks for it yet.
- **Pruning.** `world.things` grows one entry per placement that was ever written, and
  `removedThings` one per thing taken. Both are bounded by the number of placements in the project,
  so a save is small; a project with tens of thousands of placements would want the defaults
  stripped on write. Defer until a save file exists to measure.
- **A thing that is deleted from the project** leaves an orphan entry in `world.things` keyed by a
  placement id no map holds. Harmless (nothing reads it) and lossless (an undo that puts the
  placement back finds its memory intact), which is why it is not pruned on load. Revisit with the
  save file.
