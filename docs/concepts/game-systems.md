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
5. the base layer is exactly `core`, `stats` and `inventory` — pinned, because a base system is always on and therefore costs every project its components and its runtime; and **every base system contributes at least one ECS system**, because an always-on bundle that runs nothing is the "declared but nobody reads it" shape with a UI row in front of it. `stats` joined this layer only in the commit that gave it a reader; `time` is still out of it for the same reason `stats` used to be.

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

`GameSystemRuntimeContext` carries the project's **effective** `componentRegistry` alongside the map resource and the entity library. A system that spawns entities of its own at runtime — a dropped item, a respawned enemy, the hero itself — must build them through that and never through `BUILT_IN_COMPONENT_SPECS`, or a switched-off system's components would come back to life on a respawn while staying dormant everywhere else.

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

The model is built in `apps/maker-gjs/src/services/game-rules-model.ts` (pure, unit-tested) and rendered in `widgets/data-view.ts`. A system another enabled system `requires` has its switch locked and says by whom. The group still hides itself when a build has no switchable system at all — an empty titled group with a description reads as broken — but that is no longer the shipped state: `combat-action` puts one switch on the page.

## Conditional states and the flag store

The base layer's payload this round is the thing that makes the simple view able to build a real game: a key sets a flag, a locked door opens only when that flag is set.

- **`GameSaveStateComponent`** (session singleton) holds `flags`. `FlagSystem` folds `FLAG_SET` into it — the event `EventActionSystem` has emitted since the action list shipped, heard by nobody until now.
- **`EntityStatesComponent`** is attached by the spawn pipeline when a definition declares `states`, carrying the authored states plus the entity's base actions.
- **`StateSystem`** resolves the first matching state each tick and swaps the entity's action list, so `EventActionSystem` runs the new body unchanged. Per-tick and idempotent rather than event-driven: it covers entities spawned after a flag was set, needs no ordering agreement with `FlagSystem`, and cannot miss an event. Gated on `RuntimeModeComponent` — the editor always shows the base composition.

**One condition shape**, `{ flag, equals? }` with `equals` defaulting to `true` (`StateCondition`, `types/data/EntityDefinition.ts`). An expression DSL nobody validates is refused. Any other `when` is a validation *warning* and never matches, so a project from a newer editor opens with reduced behaviour instead of an error.

**Actions only, this round.** A state overlaying any other component type validates with a warning and stays inert. The cost is visible in the first hour and is named rather than hidden: a door teleports once you have the key but never *looks* open, and a chest still looks closed after it gave you its item. Applying a `visual` or `collision` overlay means rebuilding a live entity's sprite and collider mid-frame while keeping its runtime companions (`TriggerFiredComponent`) alive — the first piece of engine work in this design that rebuilds a spawned entity, and it deserves its own round.

## The first switchable system: `combat-action`

Realtime fighting, the Zelda / Secret of Mana shape. It exists as much to *prove the frame* as to
provide fighting: everything it needed was a registration, and the diff touched no framework
mechanism except to add one field to the runtime context.

**What it owns.** `weapon` (damage, reach, swing time, knockback, animation, sound), `hostile`
(behaviour, aggro radius, contact damage, attack interval, drop, respawn, experience reward),
`hurtbox` (presence means "can be hit"), `invulnerable` (the post-hit grace period).

**What it reuses, and why that is the point.** Hit points are `stats`. The enemy's look is
`visual`, its speed `movement`, its patrol `npc-route`, its solidity `collision`, its drop
`inventory`'s `item`. A second hp field on `hostile` would have been the failure: the composition
model only pays off when the second system to want a number reads the first system's.

Two consequences fall out of that reuse. `movement` stopped being data-only — `HostileAiSystem`
drives ordinary placements and has no `CharacterDefinition` to read a speed off, so `movementSpec`
now builds a `MovementComponent`. And `PlayerSystem` now composes the hero from its own
`EntityDefinition` through the effective registry: the player is persisted as a library entity but
handed to that system as a flat view model carrying only a look and a speed, so a stat block or a
weapon authored on the hero used to be silently dropped. Because it goes through the *effective*
registry, a dormant component stays dormant on the hero exactly as it does on a placement.

**Five ECS systems, and the order is load-bearing.** `MeleeAttackSystem` (first — it advances the
shared combat clock the others read), `HostileAiSystem`, `KnockbackSystem` (after both velocity
writers, so its pushback survives the frame), `DefeatSystem`, `HudSystem` (last, so it draws the
hit points this frame's damage produced).

**The clock.** Excalibur hands systems an elapsed delta, not a timestamp. A swing cooldown, an
i-frame window and a respawn timer that each kept their own would drift apart, so one `nowMs` lives
on `CombatSessionComponent` and the first system in the list advances it.

**Where the boundary between `stats` and `combat-action` runs.** `StatsSystem` says *hp reached
zero* and emits `ENTITY_DEFEATED`. `DefeatSystem` decides what that means — drop, experience,
respawn, or (for the hero) a placeholder full heal. Keeping the second out of the first is what
lets `combat-turn` later reuse the same hit points without inheriting Zelda's rules.

**Nothing in the fight is a `Command` or a project op.** A drop, a respawn and the HUD are
*playtest* state: scene-lifetime, rebuilt from the map on the next load, and deliberately absent
from the undo stack and the wire, because playing a game is not editing it. The precedent is
`PlayerSystem`, which `scene.add`s the hero the same way. The map's `objectPlacements` is read for
respawn and never written. The only thing this system persists is its own on/off switch, which
rides `__project/systems.set` like every other.

Two rules follow for anything spawned mid-play. It is built with `runtime: true`, so it never
wears the editor's cell frame or marker diamonds — `MapScene.refreshPlacementGraphicsForMode`
cannot fix that afterwards, because it only walks placements that exist in the map and a drop's
placement is synthetic. And its appearance comes from the entity library: `hostile.dropItemId` is
a bare id, so an author who makes an entity of that id with a `visual` gets it on the ground.
Without a match the drop is invisible — the honest cost of `dropItemId` having no appearance
anywhere until `item-def` ships, and a placeholder icon would hide it.

**Input.** `InputSourceComponent` gained `attackHeld`, and `InputSystem` maps X / J to it.
Transport rule 3 is unchanged: combat reads the component, never a keyboard. Attack is a second
button rather than an overload of the action button because the two mean opposite things to the
same tile — action *talks to* what is in front of you, attack *hits* it.

**The HUD is Excalibur screen-space, not GTK**, so a Full Run window and a browser export render it
too. A GTK overlay would exist only inside the maker, and the first person to export their game
would lose their health bar with no explanation.

## Reach — what the frame must not preclude

| Item | Status |
|---|---|
| `GameSystemSpec` + registry + ownership guard | **landed** |
| Derived `BUILT_IN_COMPONENT_SPECS`, `effectiveComponentRegistry` threaded to every consumer | **landed** |
| Base layer `core` / `stats` / `inventory` | **landed** |
| Flag store, `EntityState.when` runtime, actions-only overlays | **landed** |
| `__project/systems.set` + the Game-rules page | **landed** |
| `stats` — the spec (`maxHp`, `hp` basic; `attack`, `defense`, `level`, `exp`, `expToNext`), live values as a runtime component, `DAMAGE_DEALT` / `ENTITY_DEFEATED` / `EXPERIENCE_GAINED` / `LEVEL_UP` and `StatsSystem` | **landed**, in the same commit as its reader |
| `combat-action` — `weapon` / `hostile` / `hurtbox` / `invulnerable`, melee, aggro, knockback, defeat + drops + respawn, heart HUD, `GameSystemSpec.templates` | **landed** — the first switchable system |
| `inventory` bag — `InventoryComponent`, `item-def` library entities, `INVENTORY_CHANGED` | planned, with the first system that reads a bag |
| `stats.speed` | planned, with `combat-turn`'s speed-sorted `TurnOrderSystem` — its only reader |
| A real game over — `combat-action` currently full-heals a defeated hero | planned, with playthrough save-state |
| `combat-turn` — a second Excalibur scene, encounter tables, party, skills (`GameSystemSpec.scenes`) | planned |
| `economy` + `time` — shop, crop, tool, stamina, the clock, `schedule`, `GameClockComponent` | planned |
| Regions as a map primitive (`regionKinds`) | planned, with the two systems that want them |
| `GameSystemSpec.config` field lists, per-map `mapFields`, `starter` packs | planned, each once a renderer exists for it |
| State overlays beyond `actions` (live sprite + collider swap) | planned |
| User-defined component schemas and the TypeScript script tier | planned |

Each planned row is a registration rather than a refactor — that is what the frame buys. None of them is declared in the type today, because a field nothing renders or runs is the shape the deletion milestone removed.

**Why `stats` waited, and what let it in.** Its only reader is a combat system. Registering it earlier would have put eight editable fields — Max HP, HP, Attack, Defense, Speed, Level, Experience, Experience to next — in front of a child, under an always-on row, where setting HP to 10 changed nothing about the game. It therefore shipped in the same commit as `combat-action`, and the rule generalises one level down: **a field earns its place the same way a component does.** Seven of those eight fields have a reader here — `maxHp` draws the heart row, `hp` seeds the live block, `attack` is added to a swing, `defense` is subtracted from a hit, and `level`/`exp`/`expToNext` are the fold a defeated enemy pays into. `speed` does not, so it is **not shipped**: its only reader is `combat-turn`'s speed-sorted `TurnOrderSystem`, and in realtime combat a character's movement rate is already `movement.tilesPerSec`. It arrives with its reader, like everything else in the reach table.

`time` is still out of the base layer for exactly the reason `stats` used to be: its only reader, `economy`, is deferred.

## Cross-references

- [`entity-and-appearance-model.md`](entity-and-appearance-model.md) — the component model these systems own components in.
- [`object-system.md`](object-system.md) — placements, spawn flow, the event bus these systems talk over.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — the `__project/*` channel `systems.set` rides.
- [`runtime-modes.md`](runtime-modes.md) — the `RuntimeModeComponent` gate `StateSystem` respects.
