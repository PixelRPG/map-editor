# Entity Composition & Appearance Model

> Status: tracked in the [migration phases](#migration-phases) table — the single source of truth for what's landed vs planned. This is the agreed **target** content model (direction decided 2026-06-09); it supersedes the composition layer of [`object-system.md`](object-system.md) (`ObjectKind`-switch + `ObjectProperties` union) when its phases land — until then object-system.md accurately describes the shipped code.

## Why a target model

Two findings forced this document:

1. **Two parallel entity systems.** The Cast view (PRs #145–#158) models characters as `CharacterDefinition`; the object system models NPCs/items/teleports as `ObjectDefinition`. Both model "an NPC", "a player", "a thing with behaviour". Every further Cast feature deepens the split.
2. **`kind` as a composition switch doesn't scale.** The shipped `ObjectSpawnSystem` composes components via a `kind`-switch over a kind-discriminated `properties` union. Every new capability needs a new switch arm *in engine code* — which walls off the planned **built-in code editor** (user-defined behaviour can never enter the switch) and made even our own "place a character as an NPC" question awkward.

The shipped engine substrate was an exploratory prototype (by design). What carries over and what changes:

| Keep (proven) | Replace (prototype) |
|---|---|
| Definition/Placement split | `ObjectKind` as composition driver |
| wholesale-replace override semantics | `ObjectProperties` discriminated union |
| stable IDs everywhere; data-only components; logic-only systems; event bus | `kind`-switch in `ObjectSpawnSystem` |
| tiles as batched `TileMap` + per-sprite `TileProperties` | `CharacterDefinition` as a separate schema |
| session-singleton, `__project/*` channel, `Command` op-log | `SpriteRef`-only visuals (no animation playback) |

## The model

Prior art, deliberately: **flecs prefabs / Minecraft-Bedrock component bags** (explicit component lists on data-driven definitions), **RPG-Maker database** (templates as the approachable authoring surface), **RPG-Maker event pages, modernised** (declarative states), on the existing **Excalibur ECS** substrate (Overwatch-style data/logic split).

```
Layer 0   Sprite Sheet        raw image + grid (conceptual — stays embedded in the asset file)
Layer 1   Assets              ├─ Tileset     sheet + per-tile TileProperties
                              ├─ Appearance  sheet + named animations + body collision box
                              └─ (later: audio, dialogue, scripts)
Layer 2   Entity Definition   named, project-level: an explicit LIST OF COMPONENTS
                              (template = editor preset; states = conditional component overlays)
Layer 3   Placement           definition instance at (map, layer, tile) + per-instance overrides
Runtime   ECS                 definition+placement flatten into an Excalibur entity at spawn
```

### Layer 1 — Appearance

An **Appearance** is today's `SpriteSetData { kind:'character' }` — image + grid + `characterAnimations` + the uniform body collision box — renamed and treated as a first-class library asset next to Tilesets. The Cast "Sprite sheet" editor already produces exactly this; it moves conceptually into the asset library instead of being a peer tab of Character. `CharacterAnimation` (frames + durationMs + loop) is unchanged. No file split for Layer 0 until two appearances genuinely share one image (YAGNI).

An entity's visual is a union — single sprite for a chest/sign, full animation set for anything that walks:

```ts
type Visual =
  | { kind: 'sprite'; sprite: SpriteRef }                                     // chest, sign, torch
  | { kind: 'appearance'; appearanceId: string; defaultAnimation?: string }   // actor, animated NPC
```

The object-system open question "animated objects need an `AnimationComponent` + tick system" and this layer are **the same work item**: the animation component's design input is an `AppearanceRef`, not a bare `animationId`.

### Layer 2 — Entity Definition: explicit components

```ts
interface EntityDefinition {
  /** Stable, project-unique. */
  id: string
  /** Editor label. */
  name: string
  /** THE composition: typed, serialisable component data. Order is not semantic. */
  components: ComponentData[]
  /** Conditional component overlays — see "States". Optional. */
  states?: EntityState[]
  /** Editor-only metadata. `template` names the preset that seeded this definition. */
  editorData?: { template?: string; category?: string; icon?: string }
}

/** One serialisable component config. `type` keys into the component registry. */
type ComponentData = { type: string } & Record<string, unknown>
// e.g. { type:'visual', visual: Visual }
//      { type:'movement', tilesPerSec: 3 }
//      { type:'npc-route', waypoints: [...] }
//      { type:'dialogue', dialogueId: 'guard-1' }
//      { type:'trigger', on:'action-button', once?, scriptId? }
//      { type:'teleport', targetMapId, targetTileX, targetTileY, facing? }
//      { type:'item', itemId, qty?, pickupSound? }
//      { type:'collision', blocking: true }
//      { type:'spawn-point', spawnId: 'player' }
//      { type:'script', scriptId, params? }            // Phase C
```

Key consequences:

- **No `kind`.** The shipped `ObjectProperties` union was already component data in disguise (`TeleportProperties` ≙ `TeleportComponent` fields, `NpcProperties` ≙ `NpcComponent` fields). Making components explicit deletes both the union *and* the spawn switch. `blocking` stops being a special top-level field — it's the `collision` component's data.
- **Spawn becomes generic.** `ObjectSpawnSystem` walks `components[]`, asks the **component registry** for each `type`, instantiates. No per-capability engine edits.
- **A "character" is just a definition** with `visual` + `movement` (+ optionally `dialogue`/`npc-route`/`trigger`). `CharacterDefinition` is deleted; the hero/NPC distinction is derived (referenced by `playerActorId` vs placed with NPC components). The whole "which kind is an actor?" question from the earlier draft dissolves.

### The component registry

```ts
interface ComponentSpec<T extends ComponentData = ComponentData> {
  type: string                                    // 'visual', 'movement', …
  schema: JSONSchema                              // validation + GENERATED inspector UI
  build: (data: T, ctx: SpawnContext) => Component | Component[]   // ECS instantiation
  editor?: { label: string; icon?: string; basic?: boolean }       // disclosure tier
}
```

- Engine ships the built-in specs (visual, movement, collision, trigger, teleport, item, dialogue, npc-route, spawn-point, custom-data).
- **The inspector is generated from `schema`** — no per-kind hand-built inspector pages. `editor.basic` marks which fields/components a template surfaces by default (progressive disclosure lives in data, not just in UI code).
- **The future code editor registers new specs** through the same registry. User components are first-class, not bolted on.
- Registry mirrors the existing `BUILT_IN_COMMANDS` registry discipline: a component type that isn't registered fails validation loudly (no silent-skip).

### Templates (the "RPG-Maker database" surface)

A **template** is an editor-side preset: a named starter `components[]` + which fields are "basic". `NPC` = visual+movement+npc-route+trigger; `Item` = visual+item+trigger; `Teleport` = trigger+teleport; `Spawn point` = spawn-point. Beginners pick a template, fill 3 friendly fields, never see a component. Power users open the full component list on the same definition. **Zero engine semantics** — `editorData.template` is a label for the editor; deleting it changes nothing at runtime. New templates are content, not code.

### States (conditional overlays — the no-code behaviour tier)

RPG Maker's most-loved feature is event *pages*: same object, different appearance/behaviour per condition. Modernised, declarative, collab-deterministic:

```ts
interface EntityState {
  id: string                 // 'open', 'night', 'quest-done'
  when?: Condition           // e.g. { flag: 'door-key-used' } — first matching state wins; no `when` = manual/scripted switch
  components: ComponentData[] // overlays base components, wholesale-replace PER TYPE (same override discipline as placements)
}
```

A door (closed/open), a day/night NPC, a quest-stage marker — all without code. State evaluation is a system (`StateSystem`) reading project flags; a state switch swaps the overlaid components on the live entity. The condition vocabulary starts tiny (project flags) and grows. **Phase 2** — designed now so `components[]` and the override discipline anticipate it, built after the composition refactor.

### The behaviour ladder

This is how "simple maker" and "real engine" coexist on one vocabulary:

1. **Template** — pick "NPC", fill name/appearance/speed. (no concepts to learn)
2. **Fields** — tweak the template's basic fields in the generated inspector.
3. **Components** — open the full list; add `dialogue`, flip `collision`. (still no code)
4. **States** — conditional overlays; doors, day/night, quest stages. (still no code)
5. **Scripts** — `{ type:'script', scriptId }`; the built-in code editor, attached to definitions, driven by the ECS event bus (`trigger-fired`, `walked-onto-tile`, `item-picked-up`, …). (full engine power)

Each rung is the same substance (components on one entity model) — no cliff where the user must migrate to "the other system".

### Layer 3 — Placements (unchanged)

`ObjectPlacement` keeps its shipped shape and semantics: `defId` or `inline`, per-instance `overrides` with **wholesale replace** — now keyed per component `type` (`overrides.components` replaces a component's data in its entirety, never deep-merged). Tiles stay batched `TileMap` cells with sprite-level `TileProperties`; z-ordering between tile layers and object actors stays as designed in object-system.md.

### Player resolution

- Project-level **`playerActorId`** names the default player definition (replaces `CharacterDefinition.isPlayer`; the one-of-N invariant becomes structural).
- `PlayerSpawnSystem` (exists) instantiates it at the `spawn-point { spawnId:'player' }` placement and attaches the **existing** `PlayerComponent` marker + `PlayerActorComponent` (runtime state: facing, speed, role-indexed animations).
- Simple-maker case stays one toggle in the Cast detail ("is the default player?" → writes `playerActorId`).

## Editor surfaces

- **Library / Assets** — Appearances + Tilesets (the Data view already lists both; it becomes the canonical asset home; appearance/animation editing lives with the asset).
- **Cast view** — survives as the friendly authoring surface over entity definitions seeded from the `NPC`/character templates: name, Appearance picker, speed, player toggle; components/states/scripts behind disclosure. All of #145–#158's UI (galleries, inspectors, animation timeline, dialogs) carries over.
- **Objects library + object tool** (the pending object-system editor UX) — same definitions, placed on maps; built once, on the new composition, instead of once per old model + once per new.

## Migration phases

| # | Scope | Status |
|---|---|---|
| A | **UI/naming, no schema break** — "Sprite sheets" → "Appearances" (labels only, incl. Data view + import dialog); deep-link "Edit appearance" row (+ "Used by N characters") from the character detail to the appearance editor. Relocating the animation-editor page into the Library view rides Phase B/C's view work. | **landed** |
| B0 | **Component registry + field DSL (engine)** — `entity/component-spec.ts` (`ComponentSpec` + `FieldDescriptor`), 11 built-in specs, `BUILT_IN_COMPONENT_SPECS`, `validateEntityDefinition`. | **landed** |
| B1 | **Composition refactor — objects (engine)** — `EntityDefinition.components[]`; `ObjectSpawnSystem` kind-switch → registry walk (`entity/spawn-placement.ts`); `ObjectProperties` union + `blocking` dissolve into component data; `objectLibrary` → `entityLibrary`; `ObjectDefinition` + `ObjectKind` deleted; `scripts/migrate-to-entity-components.mjs` migrated all `games/*`; format validators reject unregistered component types. | **landed** |
| B2 | **Composition refactor — characters (engine)** — migrate `GameProjectData.characters[]` → `entityLibrary`; `isPlayer` → `playerActorId`; delete `CharacterDefinition`; `Visual` union + appearance-driven animation component; entity collab ops. | **planned** |
| C | **Object-system editor UX on the new model** — library mode, object tool, generated inspectors (from component schemas), Cast view rebased onto templates. | **planned** |
| D | **States** — `EntityState` + `StateSystem` + flags vocabulary + state UI. | **planned** |
| E | **Code editor** — script representation (likely TS — the whole stack is TS and gjsify can bundle/run it; sandboxing TBD), `script` component spec, editor surface. The `scriptId` seam already exists on `trigger`. | **planned** |

Phases B+C land together or B slightly ahead; do **not** build the object-tool UX on the kind model first (it would be built twice).

## Transport / collab

Unchanged in principle, restated for the new shapes: entity definitions, appearances, templates and states are **project-level** data → `__project/*` ops (coarse, idempotent upserts — like `__project/spriteset.update.chunk`, PR #156). Placements are scene state → `Command` op-log (undo + peers). State *switches* at runtime are gameplay events → op-log once multiplayer game-ops land. All five transport constraints in `AGENTS.md` apply to every new shape here (stable ids, operation-oriented mutation, JSON-serialisable, no circular refs, awareness for ephemeral presence).

## Open questions

1. **Condition vocabulary for states** — start with project flags only; switches/variables RPG-Maker-style? Decide at Phase D.
2. **Multiple appearances per entity** (paperdoll/equipment) — `Visual` stays single; the union leaves room for a `layers` variant later.
3. **Script sandboxing** — TS in-process vs sandboxed; decide at Phase E (object-system.md carries the same question).
4. **Definition variants** (`extends`, Unity-prefab-variant style: "guard" extends "villager") — deliberately **not** in v1; single-level prototype→instance (definition→placement) must prove insufficient first.

## Cross-references

- [`object-system.md`](object-system.md) — describes the **shipped** substrate this refactors; placements/overrides/tiles/z-order/systems/bus carry over verbatim. Its composition sections (ObjectKind, properties union, kind-switch) are superseded by this doc when Phase B lands.
- [`editor-architecture.md`](editor-architecture.md) — ECS-as-model; generated inspectors and definition editing are views over the same world.
- [`runtime-modes.md`](runtime-modes.md) — states/scripts/triggers gate on `RuntimeModeComponent` (no effects in pure editor mode).
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — op channels + transport constraints for every shape above.
