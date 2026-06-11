# Object System

> Status: tracked in the [implementation phases](#implementation-phases) table — the single source of truth for what's landed vs pending.

The PixelRPG editor models **tiles**, **NPCs**, **items**, **teleports**, **spawn points**, **events**, and **collider zones** under one unified concept: the *Definition / Placement* split, with Excalibur ECS as the runtime substrate.

This document is the source of truth for the data model + ECS layout. When schema or system responsibilities change, update this file in the same commit.

> **Composition layer lives elsewhere:** the entity-composition refactor replaced the early `ObjectDefinition` / `ObjectKind` prototype with explicit `components[]` on `EntityDefinition` + a component registry (`packages/engine/src/entity/`). A placement resolves to an `EntityDefinition` and `ObjectSpawnSystem` walks its `components[]` through the registry (no `kind`-switch); the project library is `GameProjectData.entityLibrary`. **The source of truth for composition is [`entity-and-appearance-model.md`](entity-and-appearance-model.md).** This doc owns what carries over unchanged: placements + wholesale-replace override semantics (keyed per component `type`), tile properties, layers / z-order, the runtime systems + event bus.

## Why this exists

RPG Maker (our reference) separates the world into **tiles** (a finite palette) and **events** (a special grid-aligned object kind that lives on a dedicated event layer). The result is two parallel systems with overlapping responsibilities — tiles can have passability + sound, events have triggers + scripts, but neither can do both, and switching between them is friction for the user.

We unify under one prototype/instance pattern:

- **Definitions** describe a thing once — its sprite, its properties, its triggers.
- **Placements** put a definition at a specific (map, layer, tile) position. They can override the definition's defaults inline.
- **Tiles** are a high-frequency special case: they keep batched `TileMap` rendering, but their per-sprite properties (walkable, footstep sound, surface) live in the sprite-set so all placements share them.
- **Objects** are a low-frequency, dynamic case: each placement becomes one Excalibur entity at runtime, composed from components.

The result: water-tiles play splash sounds project-wide with one edit; "apple-tree" is defined once and placed 50 times; teleports, NPCs, items, and the player are all object placements with different component compositions.

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

### Entity definitions live in the project library

`GameProjectData.entityLibrary?: EntityDefinition[]` is the projectwide pool of reusable definitions. Each `EntityDefinition` is `{ id, name, components[], states?, editorData? }` — an explicit list of typed, serialisable component configs walked through the component registry at spawn time. The full model (registry, field DSL, templates, states) is owned by [`entity-and-appearance-model.md`](entity-and-appearance-model.md); the types live in `packages/engine/src/types/data/EntityDefinition.ts` + `packages/engine/src/entity/`.

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
  overrides?: { name?: string; components?: ComponentData[] }

  // … OR fully inline (for one-offs). Exactly one of {defId, inline} must be present.
  inline?: EntityDefinition
}
```

#### Override semantics — wholesale replace per component `type`

`overrides` is **not** deep-merged. `name` replaces the display name; each entry in `overrides.components` **replaces the base component of the same `type` in its entirety** (a type absent from the base is appended). See `mergePlacementComponents` in `packages/engine/src/entity/data-access.ts`.

If a user wants "same as library but with a different teleport label", they put the **entire** `teleport` component config in `overrides.components` with the new label included. Deterministic behaviour beats convenience for the editor's mutation surface.

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
| `TileTransformComponent` | tileX, tileY, layerId | Placement (always attached by `spawn-placement.ts`) |
| `PlacementIdComponent` | id | Placement (always attached — the stable selection / save-state key) |
| `SpriteRefComponent` | spriteSetId, spriteId, animationId? | `visual` component config (registry spec) |
| `TriggerComponent` | on, once?, scriptId? | `trigger` component config |
| `CollisionComponent` | shape: 'tile' (single-tile, future-extensible to 'rect'/'circle') | `collision` component config |
| `TeleportComponent` | targetMapId, targetTileX, targetTileY, facing? | `teleport` component config |
| `ItemComponent` | itemId, qty, pickupSound? | `item` component config |
| `NpcComponent` | dialogueId?, route?, facing? | `dialogue` / `npc-route` component configs |
| `SpawnPointComponent` | spawnId, facing? | `spawn-point` component config |
| `CustomDataComponent` | bag: Record<string, unknown> | `custom-data` component config |

The registry (`BUILT_IN_COMPONENT_SPECS` in `packages/engine/src/entity/registry.ts`) maps each serialisable component `type` (`visual`, `movement`, `collision`, `trigger`, `teleport`, `item`, `dialogue`, `npc-route`, `spawn-point`, `custom-data`, `script`) to a spec that validates the data and builds the runtime component. Collision is its own component, orthogonal to what the entity "is" — an NPC, a chest and a Zelda-stone item all opt into blocking by carrying `collision`; the `trigger { on: 'action-button' }` + `collision` pair is the canonical "interact from an adjacent tile" recipe. Editor **templates** (`apps/maker-gjs/src/services/entity-templates.ts`) seed sensible component sets for new library entries.

Component rule: data only. No methods that mutate state, no references to systems. Components are serialisable.

### Systems (logic only — no state)

| System | Responsibility |
|---|---|
| `ObjectSpawnSystem` | On scene activate: walk `map.objectPlacements`, resolve each via library lookup + override merge, construct entities with the right component composition. Runs once per scene visit. |
| `TriggerSystem` | Each tick: detect player walk-onto / action-button-while-facing against entities with `TriggerComponent`. Emits `engine.events.emit('trigger-fired', { entity, by: 'walk-onto' \| 'action-button' \| 'auto' })`. |
| `TeleportSystem` | Listens for `trigger-fired`. If the firing entity has a `TeleportComponent`, emits `teleport-requested` with the target — the host engine is responsible for switching maps + repositioning the player (not yet wired; see the event table below). |
| `ItemPickupSystem` | Listens for `trigger-fired`. If the entity has an `ItemComponent`: emit `item-picked-up`, play pickup sound, remove the entity. `TriggerComponent.once` already guarantees re-pickup is impossible in the same scene visit (the trigger never re-fires) so there is no separate "once per scene" check here. |
| `WalkOnTileSystem` | On player tile-step: look up the tile cell in `TileMap`, resolve the `SpriteData.properties` via the sprite-set, emit `engine.events.emit('walked-onto-tile', { tileX, tileY, properties })`. Other systems (audio, encounter, blocker) listen on this. |
| `PlayerSystem` (spawn handling) | On scene activate, find the entity with `SpawnPointComponent { spawnId: 'player' }` and either move the existing player entity there or instantiate one (`spawnPlayer` / `resolveSpawnTile` in `player.system.ts`). |

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

The shipped surface (entity-composition C2–C6 + the tile-like-object UX, PRs #179–#184):

- **Objects view** — a top-level master-detail view over the whole `entityLibrary` (world objects AND cast characters, the latter with a "Cast" badge), edited through the generated component inspector (`ObjectsController`, `win.new-object` / `win.open-object`).
- **Object brushes in the scene editor's Tiles tab** — a visual sprite-thumbnail palette (shared `TilePalette` / `createSwatchWidget`) below the tile palette; single-click a card to arm the brush (`win.set-object-brush`), which switches to the `'object'` tool.
- **Object tool** — part of the `EditorTool` union; stamps the armed brush onto the clicked tile as an undoable, collab-synced `PlaceObjectCommand`. Placements render framed with a shared hover ghost. The FloatingTopBar context chip quick-selects tiles or objects depending on the active tool.
- **Props tab "Selected object" group** — selecting a placement (`'select'` tool or `win.select-placement`) shows its name/position + an undoable Remove (`RemoveObjectCommand`).
- **Objects visibility row** in the Layers tab (`win.toggle-objects`).
- **Tile properties** — edited in the Sheets view's tile-property inspector (Solid switch, surface); persists to the sprite-set JSON.
- **Atlas teleport curves** — built by aggregating placements carrying a `teleport` component across all maps (`project-loader.ts`; replaced the legacy projectwide `teleports[]`).

Remaining follow-ups (per-placement override editing, palette layout) are tracked in `TODO.md` § "Object-system editor UI follow-ups".

## Migration

The one-time migrations ran and their legacy fields are gone: `scripts/migrate-objects-and-teleports.mjs` moved projectwide `teleports[]` + object layers into `objectPlacements[]`, and `scripts/migrate-to-entity-components.mjs` converted `objectLibrary` definitions to `entityLibrary` `components[]`. The legacy `LayerData.type`, `LayerData.objects`, and `GameProjectData.teleports` fields are deleted from the engine types — no deprecation period (pre-release, breaking changes allowed per `AGENTS.md`).

## Implementation phases

Tracked here so anyone picking up the work knows the dependency order. PR numbers fill in as they land.

| # | Scope | Status |
|---|---|---|
| 1 | Schema + types in `@pixelrpg/engine`, format validators accept new fields, spec coverage | **landed** |
| 2 | Migration script + all `games/*` migrated to the new schema + old fields removed | **landed** |
| 3 | Components (pure data) — `TileTransform`, `SpriteRef`, `Trigger`, `Collision`, `Teleport`, `Item`, `Npc`, `SpawnPoint`, `CustomData`, `PlacementId` | **landed** |
| 4 | `ObjectSpawnSystem` + player spawn handling in `PlayerSystem` | **landed** |
| 5 | `TriggerSystem` + event-bus contract | **landed** |
| 6 | `TeleportSystem`, `ItemPickupSystem`, `WalkOnTileSystem` | **landed** |
| 7 | Editor UI — Objects authoring view, object tool + brush palette, Props selected-object group, Objects visibility row, atlas-from-placements | **landed** (#170–#174 + #179–#184; remaining polish in `TODO.md`) |

## Where this is implemented

These citations update as the work lands. Anything referenced here must exist in the tree at the cited path.

**Phase 1 (additive schema) — landed:**
- `packages/engine/src/types/data/TileProperties.ts` — gameplay properties on a sprite-set entry
- `packages/engine/src/types/data/EntityDefinition.ts` — `EntityDefinition { components[] }` (replaced the old `ObjectDefinition`); `packages/engine/src/entity/` — component registry, specs, validation, `spawn-placement.ts`, `convert.ts`
- `packages/engine/src/types/data/ObjectPlacement.ts` — map-level instances (`inline?: EntityDefinition` / `defId` + `{name?, components?}` overrides), defId/inline mutual exclusion
- `packages/engine/src/types/data/SpriteDataSet.ts` — `tileProperties?: TileProperties` field
- `packages/engine/src/types/data/GameProjectData.ts` — `entityLibrary?: EntityDefinition[]` + `playerActorId?` fields (the legacy `teleports[]` is deleted)
- `packages/engine/src/types/data/MapData.ts` — `objectPlacements?: ObjectPlacement[]` field
- `packages/engine/src/types/data/LayerData.ts` — every layer is a tile layer (the legacy `type` + `objects[]` fields are deleted)
- `packages/engine/src/format/{GameProjectFormat,MapFormat,SpriteSetFormat}.ts` — validators accept new fields, reject malformed shapes, catch orphaned layer refs + duplicate ids
- `packages/engine/src/types/data/object-system.spec.ts`, `packages/engine/src/format/object-system-validation.spec.ts` — spec coverage (registered in `src/test.mts`)

**Phases 2–7 — landed** (paths corrected in the 2026-06-09 docs audit; this block had drifted while the phases table above was already accurate):
- Migration scripts: `scripts/migrate-objects-and-teleports.mjs`, `scripts/migrate-to-entity-components.mjs`
- Components: `packages/engine/src/components/` — `tile-transform`, `sprite-ref`, `trigger`, `collision`, `teleport`, `item`, `npc`, `spawn-point`, `custom-data`, `placement-id` (one file per component)
- Systems: `packages/engine/src/systems/` — `object-spawn.system.ts`, `trigger.system.ts`, `teleport.system.ts`, `item-pickup.system.ts`, `walk-on-tile.system.ts`, player spawn handling in `player.system.ts`
- Composition layer: `packages/engine/src/entity/` — registry, specs, validation, `spawn-placement.ts`
- Placement commands: `packages/engine/src/commands/object-placement.command.ts` (`object.place` / `object.remove`)
- Editor UI: `apps/maker-gjs/src/widgets/objects-view.ts` + the scene-editor inspector tabs in `scene-editor-view.ts`

## What's NOT on the table

Decisions captured here so future PRs don't re-litigate them:

- **No deep merge** in `overrides`. Reiterated from the override-semantics section above — each overridden component replaces the base component of the same `type` wholesale (`buildVisualGraphic` resolves `animationId` over `spriteId` when building the placement graphic).
- **No deferred placements / lazy spawn.** All objects on a map spawn on scene activate. Streaming-style "spawn when within N tiles of player" can come later; not needed for current scene sizes.
- **No per-instance script overrides** beyond replacing the whole `trigger` / `script` component via `overrides.components`. Scripts attach to definitions, not placements, in v1.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — the editor UI for the object system (Objects view, object tool, inspector tabs) lives in the broader GTK-View / ECS-Model+Controller split. Library entries themselves stay on `GameProjectData.entityLibrary` (project data), not on the session-singleton.
- [`runtime-modes.md`](runtime-modes.md) — trigger *effects* only fire while runtime is active because their source events (`player-tile-changed`, `player-action-pressed`) are emitted by `PlayerSystem`, the system that gates on `RuntimeModeComponent`. In pure editor mode the placements render but walk-onto/action triggers can't fire. (`auto` triggers fire on scene init regardless — no shipped template uses them yet.)
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — stable identifiers (`ObjectPlacement.id`, `EntityDefinition.id`, `LayerData.id`) are the load-bearing primitive for op-log payloads. The transport-compatibility constraint applies to all future schema changes: stable keys in array-shaped collections, no circular refs, JSON-serialisable everywhere.

## Open questions

- **Tile property project-overrides**: do we need a `GameProjectData.tilePropertyOverrides` map for projects that want "water without splash sound"? Defer until a real use case shows up.
- **Script system**: the `trigger` component's `scriptId` points at a registered handler. We haven't picked a script representation yet (TypeScript? a small custom DSL? Lua via a sandbox?) — entity-and-appearance-model.md Phase E owns this. Placements with `scriptId` are inert until that lands.
- **Atlas teleport-curve aggregation cost** — the atlas walks every map in the project, every placement, looking for `teleport` components. For a 100-map project with ~50 placements each, that's 5000 iterations per atlas refresh. Acceptable today; revisit with caching if the atlas-refresh becomes user-perceptible (>16 ms).
