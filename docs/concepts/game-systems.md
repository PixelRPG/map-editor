# Game Systems

> Status: tracked in the [reach table](#reach--what-the-frame-must-not-preclude) — the single source of truth for what's landed vs planned.

A **game system** is the thing a user switches on: "my game has fighting", "my game has shops". It is not an ECS `System`. Keeping the two apart is the whole point of this document, because they are one word away from each other and one letter away from being merged.

| | ECS `System` (Excalibur) | Game system (`GameSystemSpec`) |
|---|---|---|
| What it is | a per-tick unit of logic | a bundle a user turns on |
| Who decides it exists | the engine | the project |
| Granularity | `TriggerSystem`, `PlayerSystem` | `core`, `inventory`, `combat-action` |
| Lives in | `packages/engine/src/systems/` | `packages/engine/src/game-systems/` |

One game system owns components, editor templates and *several* ECS systems.

## The spec

```ts
interface GameSystemSpec {
  id: string                              // stable wire + save key
  editor: { label, kidLabel, icon, base? }
  requires?: readonly string[]
  components: readonly ComponentSpec[]    // exactly one owner per component type
  templates?: readonly EntityTemplate[]
  runtime: (ctx: GameSystemRuntimeContext) => System[]
}
```

`packages/engine/src/game-systems/game-system-spec.ts`. Registered in `BUILT_IN_GAME_SYSTEMS` (`game-systems/registry.ts`), the same discipline as `BUILT_IN_COMMANDS` and for the same reason: an id that is not in the registry cannot be reconstructed on a peer, so a project naming it has to degrade predictably rather than half-work.

`kidLabel` is not decoration. It is the sentence a nine-year-old reads instead of the label, and every system has to be able to produce one — a system whose purpose cannot be said in one sentence is the wrong size.

## Ownership: a component cannot exist without a system

Every `ComponentSpec` carries `system: string`, the id of the game system that owns it. `game-systems/registry.spec.ts` fails the build unless:

1. every discovered game system is registered under its `id`, with no stale entries;
2. **every component spec in the repo is owned by exactly one game system**, and by the one its own `system` field names;
3. `requires` closes over registered ids and has no cycle;
4. a `templates[].components[].type` is always reachable from its system (own components ∪ `requires`' ∪ `core`'s) — a template may not seed a component its system cannot render;
5. the base layer is exactly `core` and `inventory` — pinned, because a base system is always on and therefore costs every project its components and its runtime; and **every base system contributes at least one ECS system**, because an always-on bundle that runs nothing is the "declared but nobody reads it" shape with a UI row in front of it.

Discovery is the same barrel trick `entity/registry.spec.ts` uses: every `game-systems/specs/*.ts` export passing `isGameSystemSpec`, with `check:barrels` guaranteeing the barrel is complete and `gjsify run check:specs` guaranteeing the spec file actually runs.

`BUILT_IN_COMPONENT_SPECS` is therefore derived — discovered from the `entity/specs/` barrel rather than hand-listed (`entity/registry.ts`). Assertion 2 is what makes that safe: a spec nobody claims fails CI.

> **Why derived-by-discovery rather than "the union of every system's `components`", as the design first put it.** That union would make `entity/registry.ts` import `game-systems/registry.ts`, which imports `specs/core.ts`, which imports the ECS systems it contributes — and `WalkOnTileSystem` imports `MapScene`, which imports the spawn pipeline, which imports `entity/registry.ts`. A module-init cycle through a top-level `const`, i.e. a `ReferenceError` whose occurrence depends on which file an entry point touches first. Assertion 2 delivers the same guarantee with an acyclic graph.

## The effective registry

```ts
effectiveGameSystems(project)      // base systems + enabled ones + their `requires` closure
effectiveComponentRegistry(project) // the union of those systems' components
```

That registry — not `BUILT_IN_COMPONENT_SPECS` — is what the four call sites that already took a registry parameter are handed, plus the two new ones:

| Consumer | Where |
|---|---|
| `validateEntityDefinition` / `validateEntityDefinitionDetailed` | `entity/validate.ts` |
| `buildPlacementEntity`, `placementSpawnWarnings` | `entity/spawn-placement.ts` |
| `markerColorFor`, `buildPlacementGraphic` | `entity/placement-graphic.ts` |
| `ObjectSpawnSystem` | `systems/object-spawn.system.ts` (constructor argument) |
| `MapScene` | `scenes/map.scene.ts` (`MapSceneOptions.componentRegistry`) |
| `EntityComponentsEditor` | `packages/gjs/.../entity-components-editor.ts` (`setRegistry`) |

`ProjectLoader.buildScene` is where a project's switches become runtime: the effective system list contributes its ECS systems, the effective registry gates what the spawn pipeline builds.

## What MapScene composes

Two layers, in this order:

1. **The editor's own systems** — pointer gestures, camera, tile editor, selection highlighting, placement spawning. Always present whatever the project switched on: they are how the editor works, not rules of the game.
2. **Each effective game system's `runtime(ctx)`**, in registry order.

`ObjectSpawnSystem` sitting in layer 1 is what keeps the spawn-point entity in the world before `PlayerSystem` (layer 2) queries for it.

## Off means dormant, never destructive

The most important line here: **disabled data is preserved and inert; unknown data is rejected.** Merging the two either makes a typo silent or makes a switch destructive.

| Situation | Behaviour |
|---|---|
| Component of a **known but disabled** system | `validateEntityDefinitionDetailed` returns it in `dormant`, not `errors`; the spawn pipeline skips its `build`; its fields are not validated (an incomplete dormant component must not block a spawn); the components editor renders no inspector but **never rewrites the data**. |
| Component **no system knows** | The existing loud failure in `entity/validate.ts` is unchanged. This is the guard for typos. |
| Project naming a **game system this build does not have** | `GameProjectFormat.validate` reports it (`unknownGameSystemIds`) and the project still opens, with that system's components dormant. A template made in a newer editor must open. |
| A peer that predates a system | Ignores the unknown `__project/*` kind and keeps editing as if the system were off — which *is* the dormant behaviour, so nothing diverges beyond "that peer sees fewer rows". |

Switching a system off writes `enabled: false` and removes no component. That is why the switch needs no confirmation: nothing is lost.

## Where the enabled set lives, and how it moves

```ts
GameProjectData.gameSystems?: Record<string, { enabled: boolean; config?: Record<string, unknown> }>
```

Absent — or an absent entry — means off, so a project written before a system existed opens with it off rather than silently gaining it.

Project-level data, so it rides the `__project/*` channel, not a `Command`: **`__project/systems.set`**, carrying the whole record, wholesale and idempotent, the same discipline as `__project/meta.update`. `ProjectStore.setGameSystemEnabled` is the single owner — persist, broadcast, remote-apply — per the transport-ready-primitives rule in `AGENTS.md`.

The per-system `config` bag is plumbed end to end (file → op → `runtime(ctx).config`) but no shipped system declares settings yet; a value a newer build wrote round-trips untouched.

## The activation UI

Data view → **Game rules**: one `Adw.ExpanderRow` per switchable system with `show-enable-switch`, so the switch is the on/off and the body is the expert surface — a child flips the switch without ever expanding, an expert expands without ever flipping. Below it, an **Always on** group listing the base layer as insensitive rows, because there is nothing to decide about them.

The model is built in `apps/maker-gjs/src/services/game-rules-model.ts` (pure, unit-tested with fixture systems — the switchable path has no shipped system to exercise it yet) and rendered in `widgets/data-view.ts`. A system another enabled system `requires` has its switch locked and says by whom. With no switchable system in this build the Game-rules group hides itself: an empty titled group with a description reads as broken.

## Conditional states and the flag store

The base layer's payload this round is the thing that makes the simple view able to build a real game: a key sets a flag, a locked door opens only when that flag is set.

- **`GameSaveStateComponent`** (session singleton) holds `flags`. `FlagSystem` folds `FLAG_SET` into it — the event `EventActionSystem` has emitted since the action list shipped, heard by nobody until now.
- **`EntityStatesComponent`** is attached by the spawn pipeline when a definition declares `states`, carrying the authored states plus the entity's base actions.
- **`StateSystem`** resolves the first matching state each tick and swaps the entity's action list, so `EventActionSystem` runs the new body unchanged. Per-tick and idempotent rather than event-driven: it covers entities spawned after a flag was set, needs no ordering agreement with `FlagSystem`, and cannot miss an event. Gated on `RuntimeModeComponent` — the editor always shows the base composition.

**One condition shape**, `{ flag, equals? }` with `equals` defaulting to `true` (`StateCondition`, `types/data/EntityDefinition.ts`). An expression DSL nobody validates is refused. Any other `when` is a validation *warning* and never matches, so a project from a newer editor opens with reduced behaviour instead of an error.

**Actions only, this round.** A state overlaying any other component type validates with a warning and stays inert. The cost is visible in the first hour and is named rather than hidden: a door teleports once you have the key but never *looks* open, and a chest still looks closed after it gave you its item. Applying a `visual` or `collision` overlay means rebuilding a live entity's sprite and collider mid-frame while keeping its runtime companions (`TriggerFiredComponent`) alive — the first piece of engine work in this design that rebuilds a spawned entity, and it deserves its own round.

## Reach — what the frame must not preclude

| Item | Status |
|---|---|
| `GameSystemSpec` + registry + ownership guard | **landed** |
| Derived `BUILT_IN_COMPONENT_SPECS`, `effectiveComponentRegistry` threaded to every consumer | **landed** |
| Base layer `core` / `inventory` | **landed** |
| Flag store, `EntityState.when` runtime, actions-only overlays | **landed** |
| `__project/systems.set` + the Game-rules page | **landed** |
| `inventory` bag — `InventoryComponent`, `item-def` library entities, `INVENTORY_CHANGED` | planned, with the first system that reads a bag |
| `stats` — a `stats` spec (`hp`, `maxHp` basic; `attack`, `defense`, `speed`, `level`, `exp`, `expToNext`), live hp as a runtime component, `DAMAGE_DEALT` / `ENTITY_DEFEATED` / `LEVEL_UP` and `StatsSystem` | planned, **in the same commit as `combat-action`** — see below |
| `combat-action` — requires `stats` + `inventory`; `weapon` / `hostile` / `hurtbox` / `invulnerable`, melee, aggro, knockback, defeat, HUD | planned |
| `combat-turn` — a second Excalibur scene, encounter tables, party, skills (`GameSystemSpec.scenes`) | planned |
| `economy` + `time` — shop, crop, tool, stamina, the clock, `schedule`, `GameClockComponent` | planned |
| Regions as a map primitive (`regionKinds`) | planned, with the two systems that want them |
| `GameSystemSpec.config` field lists, per-map `mapFields`, `starter` packs | planned, each once a renderer exists for it |
| State overlays beyond `actions` (live sprite + collider swap) | planned |
| User-defined component schemas and the TypeScript script tier | planned |

Each planned row is a registration rather than a refactor — that is what the frame buys. None of them is declared in the type today, because a field nothing renders or runs is the shape the deletion milestone removed.

**Why `stats` is not in the base layer yet, even though the design puts it there.** Its only reader is `combat-action`. Registering it now would put eight editable fields — Max HP, HP, Attack, Defense, Speed, Level, Experience, Experience to next — in front of a child, under an always-on row, where setting HP to 10 changes nothing about the game. That is the same shape `time` was dropped for (its only reader, `economy`, is deferred), so it gets the same answer: `stats` ships in the commit that gives it a reader. Note that the `movement` precedent — a data-only spec with `build: () => null` — does *not* cover it: `movement.tilesPerSec` has a reader, `PlayerSystem`, which reads it off the definition instead of a runtime component. Data-only **with** a consumer is a design choice; data-only **without** one is the defect class.

## Cross-references

- [`entity-and-appearance-model.md`](entity-and-appearance-model.md) — the component model these systems own components in.
- [`object-system.md`](object-system.md) — placements, spawn flow, the event bus these systems talk over.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — the `__project/*` channel `systems.set` rides.
- [`runtime-modes.md`](runtime-modes.md) — the `RuntimeModeComponent` gate `StateSystem` respects.
