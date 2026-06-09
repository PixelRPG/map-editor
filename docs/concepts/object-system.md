# Object System

> Status: tracked in the [implementation phases](#implementation-phases) table — the single source of truth for what's landed vs pending.

The PixelRPG editor models **tiles**, **NPCs**, **items**, **teleports**, **spawn points**, **events**, and **collider zones** under one unified concept: the *Definition / Placement* split, with Excalibur ECS as the runtime substrate.

This document is the source of truth for the data model + ECS layout. When schema or system responsibilities change, update this file in the same commit.

> **⚠️ Composition layer SUPERSEDED (landed — entity-composition refactor):** the data-model sections below that describe `ObjectDefinition` / `ObjectKind` / the kind-discriminated `ObjectProperties` union / the `kind`-switch in `ObjectSpawnSystem` are **historical** — that prototype has been replaced in the shipped code by explicit `components[]` on `EntityDefinition` + a component registry (`packages/engine/src/entity/`). A placement now resolves to an `EntityDefinition` and `ObjectSpawnSystem` walks its `components[]` through the registry (no `kind`-switch); the project library is `GameProjectData.entityLibrary`. **The source of truth for composition is [`entity-and-appearance-model.md`](entity-and-appearance-model.md).** Everything else in this doc still describes shipped behaviour and carries over unchanged: placements + wholesale-replace override semantics (now keyed per component `type`), tile properties, layers / z-order, the runtime systems + event bus. *(Cleanup follow-up: prune the historical kind/properties subsections from this file — tracked in `TODO.md`.)*

## Why this exists

RPG Maker (our reference) separates the world into **tiles** (a finite palette) and **events** (a special grid-aligned object kind that lives on a dedicated event layer). The result is two parallel systems with overlapping responsibilities — tiles can have passability + sound, events have triggers + scripts, but neither can do both, and switching between them is friction for the user.

We unify under one prototype/instance pattern:

- **Definitions** describe a thing once — its sprite, its properties, its triggers.
- **Placements** put a definition at a specific (map, layer, tile) position. They can override the definition's defaults inline.
- **Tiles** are a high-frequency special case: they keep batched `TileMap` rendering, but their per-sprite properties (walkable, footstep sound, surface) live in the sprite-set so all placements share them.
- **Objects** are a low-frequency, dynamic case: each placement becomes one Excalibur entity at runtime, composed from components.

The result: water-tiles play splash sounds project-wide with one edit; "apple-tree" is defined once and placed 50 times; teleports, NPCs, items, and the player are all object placements with different `kind` and component compositions.

## Data model

### Tile properties live on the sprite

In each sprite-set JSON, every sprite can carry gameplay properties:

```ts
interface SpriteData {
  id: number              // local sprite index
  col: number             // grid col in the sheet
  row: number             // grid row
  name?: string
  properties?: TileProperties   // ← gameplay properties for this tile
}

interface TileProperties {
  /** Default: true. Blocked tiles stop the player and fire an `on-bump` event. */
  walkable?: boolean
  /** Surface classification used by audio + animation systems. */
  surface?: 'grass' | 'water' | 'stone' | 'sand' | 'wood' | 'snow' | string
  /** Override the surface-derived default footstep sound. */
  footstepSound?: string
  /** Encounter table id (random battles). Engine resolves at walk-onto. */
  encounterTable?: string
  /** Free-form bag for project-specific extensions. */
  custom?: Record<string, unknown>
}
```

Rationale: the same sprite-set used in two projects gets the same tile behaviour. Per-project overrides can be added later as a `tilePropertyOverrides` map in the project file if a project needs to deviate; for v1 the sprite-set is authoritative.

### Object definitions live in the project library

```ts
interface GameProjectData {
  // … existing fields …
  /** NEW — projectwide object definitions. Optional. */
  objectLibrary?: ObjectDefinition[]
  /** REMOVED — `teleports[]` moves into per-map `objectPlacements` with kind:'teleport'. */
}

interface ObjectDefinition {
  id: string                   // stable, project-unique
  kind: ObjectKind
  name: string                 // editor label
  sprite?: SpriteRef           // invisible objects skip this
  trigger?: TriggerSpec
  /**
   * Whether the player can walk *through* this object. Orthogonal to
   * `kind`: an NPC can be blocking-or-not, a chest can be
   * blocking-or-not, a teleport is normally non-blocking, a
   * Zelda-stone item is blocking even though it's `kind: 'item'`.
   * Editor uses a kind-driven default for new library entries but
   * the user / per-placement override has the final say. See the
   * "Common combinations" table below for canonical recipes.
   */
  blocking?: boolean
  properties?: ObjectProperties  // kind-specific; discriminated union
  editorData?: { category?: string; icon?: string }
}

/**
 * Semantic "what is this object" — drives library categorisation,
 * inspector layout, default trigger mode, and default `blocking`.
 * NOT a component-composition switch: `blocking` is its own field
 * because collision is orthogonal to kind. Add a new kind only when
 * the editor deserves a dedicated UX surface — chests, signs, shops
 * all start life as `'event'` and graduate only if they prove out.
 */
type ObjectKind =
  | 'event'           // generic — fires a trigger, optional script
  | 'teleport'        // scene-switch trigger
  | 'item'            // pickup → inventory
  | 'npc'             // pathing, dialogue
  | 'spawn-point'     // entity spawn marker (player, mob, …)
  | 'custom'          // escape hatch for project-specific shapes

interface SpriteRef {
  spriteSetId: string
  spriteId: number
  animationId?: string
}

interface TriggerSpec {
  on: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'
  once?: boolean
  scriptId?: string
}

type ObjectProperties =
  | TeleportProperties
  | ItemProperties
  | NpcProperties
  | SpawnPointProperties
  | Record<string, unknown>   // event / custom / collider

interface TeleportProperties {
  targetMapId: string
  targetTileX: number
  targetTileY: number
  facing?: 'up' | 'down' | 'left' | 'right'
  label?: string
}

interface ItemProperties {
  itemId: string
  qty?: number
  pickupSound?: string
  // No `oncePerScene` field — use `trigger.once: true` instead.
  // `TriggerSpec.once` already prevents re-firing the trigger that
  // calls `ItemPickupSystem`; a second `oncePerScene` field would be
  // dead-state on top.
}

interface NpcProperties {
  dialogueId?: string
  route?: Array<{ tileX: number; tileY: number }>
  facing?: 'up' | 'down' | 'left' | 'right'
}

interface SpawnPointProperties {
  spawnId: 'player' | string
  facing?: 'up' | 'down' | 'left' | 'right'
}
```

### Object placements live in the map

```ts
interface MapData {
  // … existing fields …
  objectPlacements?: ObjectPlacement[]
}

interface ObjectPlacement {
  id: string                              // unique within map (save-state key)
  layerId: string                         // sort + visibility grouping
  tileX: number
  tileY: number

  // EITHER library reference (canonical) …
  defId?: string
  overrides?: Partial<Omit<ObjectDefinition, 'id' | 'kind'>>

  // … OR fully inline (for one-offs). Exactly one of {defId, inline} must be present.
  inline?: ObjectDefinition
}
```

#### Override semantics — every field replaces wholesale

`overrides` is **not** deep-merged. Each override field replaces the corresponding base-definition field in its entirety:

| Field | Override behaviour |
|---|---|
| `name`, `blocking` | Scalar replace |
| `sprite` | Whole object replace (no per-field merge of `spriteSetId` / `spriteId` / `animationId`) |
| `trigger` | Whole object replace |
| `properties` | Whole object replace (no per-field merge inside, even for the discriminated kind-specific shape) |
| `editorData` | Whole object replace |

If a user wants "same as library but with a different `label`", they put the **entire** `properties` block in `overrides.properties` with the new label included. Deterministic behaviour beats convenience for the editor's mutation surface.

`kind` cannot be overridden — that would change which kind-specific component the spawn system attaches, which would invalidate every system query that relied on the original kind. The type signature (`Partial<Omit<ObjectDefinition, 'id' | 'kind'>>`) enforces this at compile time.

### Layer changes

```ts
interface LayerData {
  id: string
  name: string
  visible: boolean
  opacity?: number
  zIndex?: number
  sprites?: SpriteDataMap[]
  properties?: Properties
  /** REMOVED — `type: 'tile' | 'object'` + `objects[]`. */
}
```

Every layer is now a tile layer with optional empty content. Objects don't live "in" a layer in the data sense — they reference a layer for sorting / visibility via `layerId`. A user wanting an RPG-Maker-style "Events" layer creates a normal layer named "Events" with no sprites and parks all event placements there. Pure convention.

## Excalibur ECS layout

Each object placement becomes one Excalibur `Entity` composed of components. Tiles stay as `TileMap` cells (batched rendering). Tile gameplay properties get queried lazily by systems via the sprite-set lookup.

### Components (data only — no logic)

| Component | Fields | Source at spawn |
|---|---|---|
| `TileTransformComponent` | tileX, tileY, layerId | Placement |
| `SpriteRefComponent` | spriteSetId, spriteId, animationId? | Def.sprite + overrides |
| `TriggerComponent` | on, once?, scriptId? | Def.trigger + overrides |
| `CollisionComponent` | shape: 'tile' (single-tile, future-extensible to 'rect'/'circle') | added whenever `Def.blocking === true` |
| `TeleportComponent` | targetMapId, targetTileX, targetTileY, facing? | Def.properties (kind: teleport) |
| `ItemComponent` | itemId, qty, pickupSound? | Def.properties (kind: item) |
| `NpcComponent` | dialogueId?, route?, facing? | Def.properties (kind: npc) |
| `SpawnPointComponent` | spawnId, facing? | Def.properties (kind: spawn-point) |
| `CustomDataComponent` | bag: Record<string, unknown> | Def.properties.custom |

### `blocking` defaults

`blocking` is independent of `kind` — collision lives in physics-space, kind lives in gameplay-space. The editor sets a sensible default per kind for a *new* library entry, but the user is always one click away from flipping it. Per-placement `overrides.blocking` is the final word.

| `kind` | Default | Why this default and not the opposite |
|---|---|---|
| `npc` | `true` | NPCs almost always block the player physically |
| `spawn-point` | `false` | Marker only — gameplay collision would defeat its purpose |
| `event`, `teleport`, `item`, `custom` | `false` | Conservative — `false` only restricts movement on opt-in. User toggles per object. |

The `item` default is `false` (apples, coins, walk-onto pickups), but plenty of legitimate items block: Zelda-style stones the player can lift and carry, push-blocks, chests. These are the same `kind: 'item'`, just with `blocking: true` flipped in the library entry. The combination `trigger: { on: 'action-button' }` + `blocking: true` is the canonical "pick up by pressing the action button from an adjacent tile" pattern.

### Common combinations

The trigger mode plus blocking flag covers most gameplay shapes. A few canonical recipes:

| Gameplay pattern | `kind` | `trigger.on` | `blocking` |
|---|---|---|---|
| Apple on the ground (walk over to collect) | `item` | `walk-onto` | `false` |
| Zelda-style stone (stand adjacent, press A to lift) | `item` | `action-button` | `true` |
| Push-block puzzle piece | `item` | `action-button` | `true` |
| Treasure chest (stand in front, press A to open) | `event` | `action-button` | `true` |
| Sign / lore plaque | `event` | `action-button` | `true` |
| Teleport pad / doorway | `teleport` | `walk-onto` | `false` |
| Damage tile (lava, spikes) | `event` | `walk-onto` | `false` |
| Invisible wall | `custom` | `none` | `true` |
| Cuttable grass clump | `item` | `walk-onto` *or none* | `false` |
| NPC walking around | `npc` | `action-button` | `true` |
| Map start position | `spawn-point` | `none` | `false` |

Component rule: data only. No methods that mutate state, no references to systems. Components are serialisable.

### Systems (logic only — no state)

| System | Responsibility |
|---|---|
| `ObjectSpawnSystem` | On scene activate: walk `map.objectPlacements`, resolve each via library lookup + override merge, construct entities with the right component composition. Runs once per scene visit. |
| `TriggerSystem` | Each tick: detect player walk-onto / action-button-while-facing against entities with `TriggerComponent`. Emits `engine.events.emit('trigger-fired', { entity, by: 'walk-onto' \| 'action-button' \| 'auto' })`. |
| `TeleportSystem` | Listens for `trigger-fired`. If the firing entity has a `TeleportComponent`, switch to `targetMapId` and place the player at `targetTileX/Y` with the requested facing. |
| `ItemPickupSystem` | Listens for `trigger-fired`. If the entity has an `ItemComponent`: emit `item-picked-up`, play pickup sound, remove the entity. `TriggerComponent.once` already guarantees re-pickup is impossible in the same scene visit (the trigger never re-fires) so there is no separate "once per scene" check here. |
| `WalkOnTileSystem` | On player tile-step: look up the tile cell in `TileMap`, resolve the `SpriteData.properties` via the sprite-set, emit `engine.events.emit('walked-onto-tile', { tileX, tileY, properties })`. Other systems (audio, encounter, blocker) listen on this. |
| `PlayerSpawnSystem` | On scene activate, find the entity with `SpawnPointComponent { spawnId: 'player' }` and either move the existing player entity there or instantiate one. |

System rule: no state beyond per-tick scratch buffers. All persistent state lives in components on entities, or in scene-attached resources.

### Layer z-ordering between tiles and objects

Tiles render through Excalibur's batched `TileMap` (one draw call per tile-layer). Object placements render as individual `Actor` entities. To keep them visually consistent with the layer they reference via `layerId`, the spawn system derives the actor's z-index from the layer's position in `MapData.layers`:

```ts
actor.z = layerIndex(placement.layerId) * Z_LAYER_STRIDE + Z_OBJECTS_WITHIN_LAYER
```

Where `Z_LAYER_STRIDE` is a wide enough integer (e.g. `1000`) that all object placements on layer N stack between the tiles of layer N and the tiles of layer N+1, and `Z_OBJECTS_WITHIN_LAYER` is a small offset within that band so objects sit just on top of their layer's tiles. Tile-layer z is `layerIndex * Z_LAYER_STRIDE`.

Practical consequence: objects on the "events" layer appear in front of "ground" tiles and behind "overhead" tiles — which is what every RPG-style level wants. Per-placement fine-tuning is possible by adding a `zOffset?: number` to `ObjectPlacement` later; not in v1 since none of the canonical recipes need it.

### Cross-system communication

Systems talk **only via the engine event bus** — `engine.events.emit(…)` / `.on(…)`. No direct method calls between systems, no shared mutable globals. This keeps systems independently testable and replaceable.

Canonical events (names match the `EngineEvent` enum in `packages/engine/src/types/engine-events.ts`):

| Event | Payload | Emitter | Listeners |
|---|---|---|---|
| `trigger-fired` | `{ entityId, by }` | `TriggerSystem` | `TeleportSystem`, `ItemPickupSystem`, script-runner (future) |
| `walked-onto-tile` | `{ tileX, tileY, properties }` | `WalkOnTileSystem` | audio / encounter / blocker (host-side, not in engine) |
| `teleport-requested` | `{ targetMapId, targetTileX, targetTileY, facing? }` | `TeleportSystem` | host engine (calls `Engine.loadMap` + repositions player) — not yet wired |
| `item-picked-up` | `{ itemId, qty, pickupSound? }` | `ItemPickupSystem` | host inventory — not yet wired |

## How the editor surfaces this

- **Library Mode-Rail row** ("Objects") with the project's `objectLibrary` browsable as cards by `editorData.category`
- **Object tool** surfaced via FloatingTopBar's tool MenuButton — paint placements like tiles, with a kind/library picker exposed either in the library sidebar (when an Objects mode is active) or inline in FloatingTopBar alongside the active-tile chip.
- **Inspector "Objects" tab** — list placements on the current map; selecting one shows the merged definition + overrides editor
- **Sprite-set editor** (future) — edit `TileProperties` on each sprite directly in the sprite-set view; changes persist to the sprite-set JSON
- **Atlas teleport curves** — built by aggregating `kind: 'teleport'` placements across all maps in the project (replaces today's projectwide `teleports[]`)

## Migration

When this lands, run `scripts/migrate-objects-and-teleports.mjs`:

1. For each `games/<x>/game-project.json`:
   - Move `teleports[]` entries into the source-map's `objectPlacements[]` with `kind: 'teleport'`, `defId` referencing a freshly-created library entry (one per unique teleport target shape).
   - Remove the project-level `teleports[]`.
2. For each map JSON:
   - Collapse any `LayerData { type: 'object', objects[] }` into `MapData.objectPlacements[]`, computing `tileX = Math.round(x / tileWidth)`, `tileY = Math.round(y / tileHeight)`, setting `layerId` to the original layer.
   - Set the surviving layer to a plain tile-layer shape (`sprites: []` if it had no sprites, drop `type`).
3. For each sprite-set JSON:
   - Heuristically pre-populate `properties` on tiles whose `name` matches known surface types (`grass`, `water`, `stone`, …). Manual fine-tuning per project after.

Once committed, the legacy `LayerData.type`, `LayerData.objects`, and `GameProjectData.teleports` fields are deleted from the engine types. No deprecation period — we have no external users yet and `AGENTS.md` explicitly allows breaking format changes.

## Implementation phases

Tracked here so anyone picking up the work knows the dependency order. PR numbers fill in as they land.

| # | Scope | Status |
|---|---|---|
| 1 | Schema + types in `@pixelrpg/engine` (additive, old fields kept + `@deprecated`), format validators accept new fields, vitest coverage | **landed** |
| 2 | Migration script + all `games/*` migrated to the new schema + old fields removed | **landed** |
| 3 | Components (pure data) — `TileTransform`, `SpriteRef`, `Trigger`, `Collision`, `Teleport`, `Item`, `Npc`, `SpawnPoint`, `CustomData` | **landed** |
| 4 | `ObjectSpawnSystem` + `PlayerSpawnSystem` | **landed** |
| 5 | `TriggerSystem` + event-bus contract | **landed** |
| 6 | `TeleportSystem`, `ItemPickupSystem`, `WalkOnTileSystem` | **landed** |
| 7 | Editor UI — inspector "Objects" tab (read-only) + atlas-from-placements (atlas auto-aggregates in PR 2). Library mode + object-tool drag-to-place remain follow-ups (tracked in TODO.md). | **landed** (partial) |

## Where this is implemented

These citations update as the work lands. Anything referenced here must exist in the tree at the cited path.

**Phase 1 (additive schema) — landed:**
- `packages/engine/src/types/data/TileProperties.ts` — gameplay properties on a sprite-set entry
- `packages/engine/src/types/data/EntityDefinition.ts` — `EntityDefinition { components[] }` (replaced the old `ObjectDefinition`); `packages/engine/src/entity/` — component registry, specs, validation, `spawn-placement.ts`, `convert.ts`
- `packages/engine/src/types/data/ObjectPlacement.ts` — map-level instances (`inline?: EntityDefinition` / `defId` + `{name?, components?}` overrides), defId/inline mutual exclusion
- `packages/engine/src/types/data/SpriteDataSet.ts` — `tileProperties?: TileProperties` field
- `packages/engine/src/types/data/GameProjectData.ts` — `entityLibrary?: EntityDefinition[]` field; `teleports[]` marked `@deprecated`
- `packages/engine/src/types/data/MapData.ts` — `objectPlacements?: ObjectPlacement[]` field
- `packages/engine/src/types/data/LayerData.ts` — `type` + `objects[]` fields marked `@deprecated`
- `packages/engine/src/types/data/ObjectData.ts`, `TeleportData.ts` — interfaces marked `@deprecated`
- `packages/engine/src/format/{GameProjectFormat,MapFormat,SpriteSetFormat}.ts` — validators accept new fields, reject malformed shapes, catch orphaned layer refs + duplicate ids
- `packages/engine/src/types/data/object-system.test.ts`, `packages/engine/src/format/object-system-validation.test.ts` — vitest coverage

**Phases 2–7 — landed** (paths corrected in the 2026-06-09 docs audit; this block had drifted while the phases table above was already accurate):
- Migration script: `scripts/migrate-objects-and-teleports.mjs`
- Components: `packages/engine/src/components/` — `tile-transform`, `sprite-ref`, `trigger`, `collision`, `teleport`, `item`, `npc`, `spawn-point`, `custom-data`, `placement-id` (one file per component)
- Systems: `packages/engine/src/systems/` — `object-spawn.system.ts`, `trigger.system.ts`, `teleport.system.ts`, `item-pickup.system.ts`, `walk-on-tile.system.ts`, player spawn handling in `player.system.ts`
- Editor UI (read-only Objects inspector, PR 7): `apps/maker-gjs/src/widgets/`

**Still pending:** library mode + object-tool drag-to-place (tracked in `TODO.md`) — to be built on the [entity-composition target model](entity-and-appearance-model.md), not the kind model.

## What's NOT on the table

Decisions captured here so future PRs don't re-litigate them:

- **No animation playback** in the spawn pipeline today. `SpriteRef.animationId` is **stored** and round-trips through save/load, but `ObjectSpawnSystem` does not yet instantiate an `Animation` graphic — it only attaches the static sprite at `spriteId`. Animation playback lands as a follow-up `AnimationComponent` + tick system; see Open questions.
- **No deep merge** in `overrides`. Reiterated from the override-semantics table above — every override field replaces wholesale.
- **No `kind` override.** Per the type signature.
- **No deferred placements / lazy spawn.** All objects on a map spawn on scene activate. Streaming-style "spawn when within N tiles of player" can come later; not needed for current scene sizes.
- **No per-instance script overrides** beyond what `overrides.trigger.scriptId` already covers. Scripts attach to definitions, not placements, in v1.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — the editor UI for the object system (library mode, object tool, inspector tab) lives in the broader GTK-View / ECS-Model+Controller split. Library entries themselves stay on `GameProjectData.objectLibrary` (project data), not on the session-singleton.
- [`runtime-modes.md`](runtime-modes.md) — `TriggerSystem` and the kind-specific systems gate on `RuntimeModeComponent` so they fire effects only while runtime is active. In pure editor mode the placements render but do nothing.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — stable identifiers (`ObjectPlacement.id`, `ObjectDefinition.id`, `LayerData.id`) are the load-bearing primitive for op-log payloads. The transport-compatibility constraint applies to all future schema changes: stable keys in array-shaped collections, no circular refs, JSON-serialisable everywhere.

## Open questions

- **Tile property project-overrides**: do we need a `GameProjectData.tilePropertyOverrides` map for projects that want "water without splash sound"? Defer until a real use case shows up.
- **Script system**: `TriggerSpec.scriptId` points at a registered handler. We haven't picked a script representation yet (TypeScript? a small custom DSL? Lua via a sandbox?). Out of scope for v1 — `kind: 'event'` placements with `scriptId` are inert until that lands.
- **Animated objects**: `SpriteRef.animationId` exists in the type but `ObjectSpawnSystem` doesn't yet build a frame cycler. Phase 3 follow-up — an `AnimationComponent` + tick system.
- **Placement-id stability vs runtime entity-id** — `ObjectPlacement.id` is the user-stable identifier (used for selection, save-state, undo references). Excalibur's `Entity.id` is a runtime-assigned integer that resets per scene load. Save / load systems must map between the two; the natural carrier is a `PlacementIdComponent { id: string }` attached during spawn. Not in v1 — wait until inventory / save-state lands and there's a real consumer.
- **Atlas teleport-curve aggregation cost** — the atlas walks every map in the project, every placement, looking for `kind: 'teleport'`. For a 100-map project with ~50 placements each, that's 5000 iterations per atlas refresh. Acceptable today; revisit with caching if the atlas-refresh becomes user-perceptible (>16 ms).
