# Object System

> Status: **planning** — schema agreed, implementation not started.
> Last meaningful change: 2026-05-22.

The PixelRPG editor models **tiles**, **NPCs**, **items**, **teleports**, **spawn points**, **events**, and **collider zones** under one unified concept: the *Definition / Placement* split, with Excalibur ECS as the runtime substrate.

This document is the source of truth for the data model + ECS layout. When schema or system responsibilities change, update this file in the same commit.

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
   * `kind` — an NPC can be blocking-or-not, a chest can be
   * blocking-or-not, a teleport is normally non-blocking. Default
   * varies by kind (see table in `ObjectKind` docs). Overridable per
   * placement.
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
  oncePerScene?: boolean
  pickupSound?: string
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
| `ItemComponent` | itemId, qty, oncePerScene?, pickupSound? | Def.properties (kind: item) |
| `NpcComponent` | dialogueId?, route?, facing? | Def.properties (kind: npc) |
| `SpawnPointComponent` | spawnId, facing? | Def.properties (kind: spawn-point) |
| `CustomDataComponent` | bag: Record<string, unknown> | Def.properties.custom |

### `blocking` defaults by kind

Set by the editor when a new placement is created. Library entries can override; per-placement `overrides.blocking` can override again.

| `kind` | Default `blocking` | Reason |
|---|---|---|
| `event` | `false` | Trigger zones usually want walk-through |
| `teleport` | `false` | Player must reach the tile to warp |
| `item` | `false` | Walk-onto pickup is the most common pattern |
| `npc` | `true` | NPCs are physical entities |
| `spawn-point` | `false` | Pure marker — no gameplay collision |
| `custom` | `false` | Conservative default |

Component rule: data only. No methods that mutate state, no references to systems. Components are serialisable.

### Systems (logic only — no state)

| System | Responsibility |
|---|---|
| `ObjectSpawnSystem` | On scene activate: walk `map.objectPlacements`, resolve each via library lookup + override merge, construct entities with the right component composition. Runs once per scene visit. |
| `TriggerSystem` | Each tick: detect player walk-onto / action-button-while-facing against entities with `TriggerComponent`. Emits `engine.events.emit('trigger-fired', { entity, by: 'walk-onto' \| 'action-button' \| 'auto' })`. |
| `TeleportSystem` | Listens for `trigger-fired`. If the firing entity has a `TeleportComponent`, switch to `targetMapId` and place the player at `targetTileX/Y` with the requested facing. |
| `ItemPickupSystem` | Listens for `trigger-fired`. If the entity has an `ItemComponent`: add to inventory, play pickup sound, remove entity (or mark `oncePerScene`). |
| `WalkOnTileSystem` | On player tile-step: look up the tile cell in `TileMap`, resolve the `SpriteData.properties` via the sprite-set, emit `engine.events.emit('walked-onto-tile', { tileX, tileY, properties })`. Other systems (audio, encounter, blocker) listen on this. |
| `PlayerSpawnSystem` | On scene activate, find the entity with `SpawnPointComponent { spawnId: 'player' }` and either move the existing player entity there or instantiate one. |

System rule: no state beyond per-tick scratch buffers. All persistent state lives in components on entities, or in scene-attached resources.

### Cross-system communication

Systems talk **only via the engine event bus** — `engine.events.emit(…)` / `.on(…)`. No direct method calls between systems, no shared mutable globals. This keeps systems independently testable and replaceable.

Canonical events:

| Event | Payload | Emitter | Listeners |
|---|---|---|---|
| `trigger-fired` | `{ entity, by }` | `TriggerSystem` | `TeleportSystem`, `ItemPickupSystem`, script-runner (future) |
| `walked-onto-tile` | `{ tileX, tileY, properties }` | `WalkOnTileSystem` | audio system, encounter system, blocker system |
| `scene-switching` | `{ fromMapId, toMapId, atTileX, atTileY }` | `TeleportSystem` | save-state, transition animator |
| `entity-removed` | `{ entityId }` | various | UI / save-state |

## How the editor surfaces this

- **Library Mode-Rail row** ("Objects") with the project's `objectLibrary` browsable as cards by `editorData.category`
- **Object tool** in the floating tool rail — paint placements like tiles, with a kind/library picker in the context chip
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
| 1 | Schema + types in `@pixelrpg/engine`, format validator, migration script, all `games/*` migrated | planned |
| 2 | Components (pure data) — `TileTransform`, `SpriteRef`, `Trigger`, `Teleport`, `Item`, `Npc`, `SpawnPoint`, `CustomData` | planned |
| 3 | `ObjectSpawnSystem` + `PlayerSpawnSystem` | planned |
| 4 | `TriggerSystem` + event-bus contract | planned |
| 5 | `TeleportSystem`, `ItemPickupSystem`, `WalkOnTileSystem` | planned |
| 6 | Editor UI — library tab, object tool, inspector tab, atlas-from-placements | planned |

## Where this is implemented

These citations update as the work lands. Anything referenced here must exist in the tree at the cited path.

- Schema types: `packages/engine/src/types/data/` (`ObjectDefinition`, `ObjectPlacement`, `SpriteData.properties`, `LayerData` updates)
- Format validators: `packages/engine/src/format/`
- Components: `packages/engine/src/components/` (new files per component)
- Systems: `packages/engine/src/systems/`
- Migration script: `scripts/migrate-objects-and-teleports.mjs`
- Editor UI: `apps/maker-gjs/src/widgets/` (library mode, object tool, inspector "Objects" tab) + `packages/gjs/src/widgets/editor/`

## Open questions

- **Tile property project-overrides**: do we need a `GameProjectData.tilePropertyOverrides` map for projects that want "water without splash sound"? Defer until a real use case shows up.
- **Script system**: `TriggerSpec.scriptId` points at a registered handler. We haven't picked a script representation yet (TypeScript? a small custom DSL? Lua via a sandbox?). Out of scope for v1 — `kind: 'event'` placements with `scriptId` are inert until that lands.
- **Animated objects**: `SpriteRef.animationId` exists in the type but `ObjectSpawnSystem` doesn't yet build a frame cycler. Phase 3 should add an `AnimationComponent` + tick system.
