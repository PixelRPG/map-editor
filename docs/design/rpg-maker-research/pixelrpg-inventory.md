# PixelRPG Maker — capability inventory

Working inventory of what PixelRPG Maker already implements. Purpose: let a later
synthesis mark each RPG-Maker concept as **have / partial / none**. Sources are files
in this fresh checkout; every claim cites a path. Statements not directly stated in
code/doc are marked *(inferred)*.

## 1. Project file format

Authoritative TypeScript schema: `packages/engine/src/types/data/GameProjectData.ts`,
`MapData.ts`, `LayerData.ts`, `EntityDefinition.ts`, `ObjectPlacement.ts`,
`SpriteSetData.ts`, `CharacterDefinition.ts`; on-disk examples in
`games/zelda-like/game-project.json`, `games/blank-starter/game-project.json`.

**`game-project.json` (`GameProjectData`)** — fields, all from
`packages/engine/src/types/data/GameProjectData.ts`:

| Field | Meaning / type | Notes |
|---|---|---|
| `version` | format version string | `"1.0.0"` in `games/zelda-like/game-project.json:2` |
| `id` | project-unique id | `"pixel-rpg"` in that file |
| `name` | display name | |
| `startup` | `GameStartupConfig` | `initialMapId`, optional `initialX`, `initialY`, `initialDirection` (`Facing`); `packages/engine/src/types/GameStartupConfig.ts`. Template has `initialX/Y: 160`, `initialDirection: "down"` (`games/zelda-like/game-project.json:5-10`) |
| `maps` | `MapReference[]` | external files only (id/name/path/type/category in the template) |
| `mapCategories?` | `MapCategory[]` | `id`, `name`, optional `parentId` for hierarchy (`types/MapCategory.ts`); template uses `"overworld"`, `"interiors"` |
| `spriteSets` | `SpriteSetReference[]` | external files only |
| `properties?` | `Properties` | flat `Record<string, string\|number\|boolean\|null>` (`types/data/Properties.ts`); template holds `gameTitle`, `author`, `version`, `description`, `defaultTileSize` |
| `entityLibrary?` | `EntityDefinition[]` | the project-wide cast/thing library; see below |
| `playerActorId?` | `string` | id of the player `EntityDefinition`; the cast toggle writes this single field; structural one-of-N, not enforced; absent ⇒ procedural placeholder hero in playtest (`GameProjectData.ts`) |
| `gameSystems?` | `Record<systemId, { enabled: boolean; config?: Record<string, unknown> }>` | switchable gameplay bundles; absent entry = off/dormant (`GameProjectData.ts`, `game-systems/registry.ts`) |
| `editorData?` | `GameProjectEditorMetadata` | editor-only (author, description, lastModified, grid/zoom prefs in the template) |

**Maps** — `MapData` (`types/data/MapData.ts`): `id`, `name?`, `spriteSets?`, `pos?`
(world coords), `tileWidth`, `tileHeight`, `columns`, `rows`,
`renderFromTopOfGraphic?`, `version`, `backgroundColor?` (solid fill under all tile
layers, for sparse/port maps), `layers: LayerData[]`, `objectPlacements?`,
`properties?`, `meshingLookBehind?`, `editorData?`. The on-disk file is separate per
map, referenced from `game-project.json`; `MapFormat.ts` owns load/validate.

**Sprite sets** — `SpriteSetData` (`types/data/SpriteSetData.ts`): `version`, `id`,
`name`, `kind?: 'tileset' | 'character'` (absent ⇒ tileset), `image?`,
`spriteWidth`, `spriteHeight`, `margin?`, `spacing?`, `sprites: SpriteDataSet[]`,
`columns`, `rows`, `animations?` (tile/object animation), `characterAnimations?`
(directional idle/walk + custom roles owned by a character sheet), `terrains?`,
`floorSpriteId?`, `editorData?`, `properties?`. A placed tile is `SpriteDataMap`:
`x`, `y` (tile units), `spriteSetId`, `spriteId`, `animationId?`
(`types/data/SpriteData.ts`). Behaviour is attached per sprite via
`TileProperties` (`walkable?`, `surface?`, `footstepSound?`, `encounterTable?`,
`custom?`) in `types/data/TileProperties.ts`.

**Entity library / cast** — `EntityDefinition` (`types/data/EntityDefinition.ts`):
`id`, `name`, `components: ComponentData[]` (each `{ type: string, … }` validated
against the component registry), `states?: EntityState[]`, `editorData?` with
`template` / `category` / `icon`. A state is `{ id, when?: { flag, equals? },
components[] }` — one flat equality against the flag store; only an `actions`
overlay has runtime today (visual/collision overlays validate with a warning and
stay inert). Characters are library entries tagged
`editorData.template === 'character'`; the `CharacterDefinition` view model
(`types/data/CharacterDefinition.ts`: `id`, `name`, `kind: 'hero'|'npc'`,
`isPlayer?`, `spriteSetId`, `animations?` deprecated, `defaultAnimation?`,
`speedTilesPerSec?`) is **not persisted**, it is mapped to/from an entity by
`entity/convert.ts`. The example project's library has `scientist` and `link`
characters, with `playerActorId: "link"`
(`games/zelda-like/game-project.json:105-139`).

**Placements** — `ObjectPlacement` (`types/data/ObjectPlacement.ts`): stable `id`
(save-state key), `layerId`, `tileX`, `tileY`, and exactly one of `defId` (with
optional `overrides: { name?, components? }` that replace base components by
`type`) or `inline: EntityDefinition`. Example teleport/door and player-spawn
placements are in `games/zelda-like/maps/tree-house.json:1344-1391`.

## 2. Map model

- **Layers** are tile layers only (the old `type: 'tile'|'object'` split is gone).
  Each `LayerData` has `id`, `name`, `visible`, `locked?`, `plane?`, `elevation?`,
  `sprites?: SpriteDataMap[]`, `properties?` (`types/data/LayerData.ts`).
  `plane` ∈ `ground | hero | overlay` — the single depth key; within a plane the
  `MapData.layers` order decides draw order, and later layers are asked first by
  `WalkOnTileSystem`. All per-sprite/layer `zIndex` fields were deliberately removed.
  `elevation?` (integer ≥ 0) is a *forward declaration*: the builder ignores it,
  `MapFormat.validate` warns "Floor n is not rendered yet" (`LayerData.ts`).
- **Collision** is per-tile in the sprite set (`TileProperties.walkable`, default
  `true`; blocked tiles bump and emit `on-bump`), plus a `collision` component on
  entities (`types/data/TileProperties.ts`, `entity/specs/collision.ts`). Editor
  shows it as wall hatching (`services/wall-hatch.ts`, `wall-overlay.ts`,
  `collision-mode.ts`). `services/region-geometry.ts` / `region-graphic.ts` are
  **flood-fill preview geometry only**, not game regions.
- **Terrain / autotile** lives on the sprite set, never the map: `TerrainData`
  (`types/data/TerrainData.ts`) maps 8-neighbour masks → sprite ids, with
  `members?`, `overlay?`, `layout?`; presets `ground-29`, `blob-47`, `patch-13`,
  `block-9`, `path-16`. Painting a terrain updates neighbouring edges
  (`services/terrain-paint.service.ts`); see `docs/design/ui-redesign/TERRAIN.md`.
- **Map links / transfers** are `teleport` + `trigger` components on a placement:
  `targetMapId`, `targetTileX/Y`, `facing?`, `label?` (`entity/specs/teleport.ts`).
  `TeleportSystem` performs the switch (`systems/teleport.system.ts`). Actions can
  also teleport (`types/data/ActionData.ts`).
- **World atlas**: each map's `editorData.atlasX/atlasY` places its card in the
  world overview; catalogues are `mapCategories` / `MapCategory` and the
  `teleport` `label` is the "Atlas label" (`types/data/MapData.ts`,
  `types/MapCategory.ts`, `games/zelda-like/maps/tree-house.json:1393-1396`).
  *(inferred)* A real in-game world map / automap is not in the schema.
- **Regions?** No `regions` field exists in `MapData`/`LayerData`
  (`types/data/MapData.ts`, `LayerData.ts`). `GameSystemSpec` explicitly omits a
  `regionKinds` field because "regions are deferred with the two systems that want
  them" (`game-systems/game-system-spec.ts`).

## 3. Registered game systems

Registry: `BUILT_IN_GAME_SYSTEMS` in `packages/engine/src/game-systems/registry.ts`,
insertion order = runtime system order in `MapScene`. Base systems are always on;
optional ones need `enabled: true`, and enabling pulls in `requires`. Data is never
deleted when switched off (dormant); unknown ids are reported but the project opens.

| id | base? | components owned | templates offered | ECS systems contributed at runtime |
|---|---|---|---|---|
| `core` | yes | `visual`, `movement`, `collision`, `trigger`, `teleport`, `dialogue`, `npc-route`, `spawn-point`, `custom-data`, `script`, `actions` | none declared in the spec | `InputSystem`, `PlayerSystem`, `TriggerSystem`, `TeleportSystem`, `EventActionSystem`, `FlagSystem`, `StateSystem`, `WalkOnTileSystem` (`specs/core.ts`) |
| `stats` | yes | `stats` | none | `StatsSystem` (`specs/stats.ts`) |
| `inventory` | yes | `item` | none | `ItemPickupSystem` (`specs/inventory.ts`) |
| `combat-action` | no, requires `stats` + `inventory` | `weapon`, `hostile`, `hurtbox`, `invulnerable` | `enemy`, `weapon` | `MeleeAttackSystem`, `HostileAiSystem`, `KnockbackSystem`, `DefeatSystem`, `HudSystem` (`specs/combat-action.ts`) |

What the systems do (from the implementations in `packages/engine/src/systems/`):
`InputSystem` reads `InputSourceComponent`; `PlayerSystem` moves the spawned hero,
resolving animation and spawn-point; `TriggerSystem` fires `on walk-onto /
walk-off / action-button / auto`, `once per visit`; `TeleportSystem` changes maps;
`EventActionSystem` executes the action list (`show-text`, `teleport`, `give-item`,
`set-flag`, `play-sfx`, `wait` — `types/data/ActionData.ts`); `FlagSystem` owns the
flag bag; `StateSystem` swaps action overlays when a flag condition holds;
`WalkOnTileSystem` resolves `walkable`, `surface`/footsteps and `encounterTable`;
`StatsSystem` seeds live HP/attack/defence; `ItemPickupSystem` adds picked-up items;
`MeleeAttackSystem`, `HostileAiSystem`, `KnockbackSystem`, `DefeatSystem` and
`HudSystem` implement contemporaneous Zelda-like combat (kidLabel "Fighting like
Zelda", `game-systems/specs/combat-action.ts`).

Missing by design (documented on `GameSystemSpec`, `game-systems/game-system-spec.ts`):
per-system `config` field descriptors, per-map `mapFields`, extra scenes (needs
`combat-turn`), `starter` packs and `regionKinds`; the config *bag* itself is
plumbed end-to-end.

## 4. All components and ECS systems

### Components (`packages/engine/src/components/`, barrel `index.ts`)

Only 17 of these are *serialisable* "component specs" (`entity/specs/*.ts`; the
`system:` owner column in §3); the rest are runtime/session/editor state.

**Authored entity components** (spec → runtime component):
- `visual` spec → `SpriteRefComponent` — sprite set / sprite id / animation reference for appearance (`entity/specs/visual.ts`, `components/sprite-ref.component.ts`).
- `movement` → `MovementComponent` — speed in tiles/sec (`entity/specs/movement.ts`, `components/movement.component.ts`).
- `collision` → `CollisionComponent` — tile-shaped collider (`entity/specs/collision.ts`, `components/collision.component.ts`).
- `trigger` → `TriggerComponent` — activation `on` + `once` + `scriptId` (`entity/specs/trigger.ts`, `components/trigger.component.ts`).
- `teleport` → `TeleportComponent` — target map / tile / facing (`entity/specs/teleport.ts`, `components/teleport.component.ts`).
- `dialogue` → `DialogueComponent` — a single `dialogueId` reference; no text stored (`entity/specs/dialogue.ts`, `components/dialogue.component.ts`).
- `npc-route` → `NpcRouteComponent` — patrol waypoints `{tileX,tileY}[]` + initial facing (`entity/specs/npc-route.ts`, `components/npc-route.component.ts`).
- `spawn-point` → `SpawnPointComponent` — `spawnId` (default `'player'`) + facing (`entity/specs/spawn-point.ts`, `components/spawn-point.component.ts`).
- `custom-data` → `CustomDataComponent` — free-form JSON bag (`entity/specs/custom-data.ts`, `components/custom-data.component.ts`).
- `script` → `ScriptRefComponent` — `scriptId` + params, *no ScriptSystem runs it* (`entity/specs/script.ts`, `components/script-ref.component.ts`).
- `actions` → `EventActionsComponent` — ordered `ActionData[]` (`entity/specs/actions.ts`, `components/event-actions.component.ts`).
- `stats` → `StatsComponent` — authored maxHp/hp/attack/defence (`entity/specs/stats.ts`, `components/stats.component.ts`).
- `item` → `ItemComponent` — item id + quantity (`entity/specs/item.ts`, `components/item.component.ts`).
- `weapon` → `WeaponComponent` — damage, reach, knockback (`entity/specs/weapon.ts`, `components/weapon.component.ts`).
- `hostile` → `HostileComponent` — behaviour `stationary|patrol|chase`, aggro tiles, contact damage, interval, drop chance (`entity/specs/hostile.ts`, `components/hostile.component.ts`).
- `hurtbox` → `HurtboxComponent` — marker for a damageable body (`entity/specs/hurtbox.ts`, `components/hurtbox.component.ts`).
- `invulnerable` → `InvulnerableComponent` — i-frame duration after hit (`entity/specs/invulnerable.ts`, `components/invulnerable.component.ts`).

**Runtime / session components**:
- `GameSaveStateComponent` — flag bag (`flags: Record<string, FlagValue>`); explicitly *not persisted* today (`components/game-save-state.component.ts`).
- `InputSourceComponent` — normalised `moveX/moveY`, `actionHeld`, `attackHeld`; device-independent input intent (`components/input-source.component.ts`).
- `TouchInputComponent` — on-screen stick/button intent, separate from `InputSourceComponent` (`components/touch-input.component.ts`).
- `RuntimeModeComponent` — marker: scene is in play mode (`components/runtime-mode.component.ts`, `docs/concepts/runtime-modes.md`).
- `EditorModeComponent` — marker: editor-singleton mode, basis for Mario-Maker-style Live Run (`components/editor-mode.component.ts`).
- `PlayerActorComponent` / `PlayerComponent` — role-indexed animation map and marker on the player actor (`components/player-actor.component.ts`).
- `PlayerSessionComponent` — last tile, action-button edge detection (`components/player-session.component.ts`).
- `SpawnOverrideComponent` — runtime-only player spawn override (`components/spawn-override.component.ts`).
- `StatsRuntimeComponent` / `StatsSessionComponent` — live HP/attack/defence, mode edge for re-seed (`components/stats-runtime.component.ts`, `stats-session.component.ts`).
- `CombatSessionComponent` — shared clock, attack edge, swing cooldown, respawn queue, HUD heart count (`components/combat-session.component.ts`).
- `EntityStatesComponent` — authored states + base actions + active state id (`components/entity-states.component.ts`).
- `TriggerFiredComponent` — presence-as-signal marker added by `TriggerSystem` (`components/trigger-fired.component.ts`).
- `HostileRuntimeComponent` — per-hostile runtime state (`components/hostile-runtime.component.ts`).
- `InvulnerableUntilComponent` — absolute i-frame expiry (`components/invulnerable-until.component.ts`).
- `KnockbackComponent` — knockback velocity/duration (`components/knockback.component.ts`).
- `HudHeartComponent` — marker + index for one heart actor (`components/hud-heart.component.ts`).
- `TileTransformComponent` — tile-grid position of an entity (`components/tile-transform.component.ts`).
- `TileMapPlaneComponent` + `zFor()` — plane/elevation → render z (`components/tilemap-plane.component.ts`).
- `PlacementIdComponent` — stable `ObjectPlacement.id` on each spawned actor (`components/placement-id.component.ts`).

**Editor-only components**: `ActiveLayerComponent`, `ActiveObjectComponent`,
`ActiveTerrainComponent`, `ActiveTileComponent`, `ActiveToolComponent` (tool union
`select|pencil|fill|eraser|eyedropper|object`), `EditorViewModeComponent`
(`showGrid`, `dimInactiveLayers`, `objectsVisible`, `showWalls`),
`MapEditorComponent` (per-tile sprite shadow), `SelectedPlacementsComponent`,
`SelectionHighlightPoolComponent`, `PointerGestureSessionComponent`,
`DragIntentComponent`, `PendingArrivalPickComponent` (teleport "Goes to" tile pick),
`PendingPlacementMoveComponent`, `UndoStackComponent` (`components/*.component.ts`).

### ECS systems (`packages/engine/src/systems/`, barrel `index.ts`)

Editor infrastructure (added by `MapScene` regardless of game systems):
- `CameraControlSystem` — editor pan/zoom via drag gestures + wheel (`systems/camera-control.system.ts`).
- `PointerGestureSystem` — turns raw pointer events into tap/drag gestures (`systems/pointer-gesture.system.ts`).
- `TileEditorSystem` — brush/eraser/fill/object clicks, eyedropper, terrain paint (`systems/tile-editor.system.ts`).
- `SelectionHighlightSystem` — overlay rings for selected placements (`systems/selection-highlight.system.ts`).
- `ObjectSpawnSystem` — spawns one entity per `objectPlacements[]` at scene activate, registry-driven (`systems/object-spawn.system.ts`).
- `HoverOverlays` — pencil/object/fill/eraser/select preview actors (`systems/hover-overlays.ts`).

Gameplay (added by game systems in §3):
- `InputSystem` — polls local keyboard → `InputSourceComponent` (`systems/input.system.ts`).
- `PlayerSystem` — spawns/animates/moves hero, reads input + spawn point (`systems/player.system.ts`).
- `TriggerSystem` — fires triggers on walk-on/off/action/auto, `once`-per-visit (`systems/trigger.system.ts`).
- `TeleportSystem` — emits map-change request on teleport trigger (`systems/teleport.system.ts`).
- `EventActionSystem` — runs the action list on `TRIGGER_FIRED` (`systems/event-action.system.ts`).
- `FlagSystem` — folds `set-flag` into `GameSaveStateComponent.flags` (`systems/flag.system.ts`).
- `StateSystem` — resolves/overlays conditional entity states each tick (`systems/state.system.ts`).
- `WalkOnTileSystem` — resolves walkable/surface/footstep/encounterTable of the entered tile (`systems/walk-on-tile.system.ts`).
- `StatsSystem` — HP, XP, levels; emits `ENTITY_DEFEATED` (`systems/stats.system.ts`).
- `ItemPickupSystem` — consumes `trigger-fired` on `item` entities, emits `item-picked-up` (`systems/item-pickup.system.ts`).
- `MeleeAttackSystem` — hero swing, sweeps a box, advances combat clock (`systems/melee-attack.system.ts`).
- `HostileAiSystem` — patrol/chase/stationary + contact damage (`systems/hostile-ai.system.ts`).
- `KnockbackSystem` — applies hit reaction to damaged bodies (`systems/knockback.system.ts`).
- `DefeatSystem` — payout, drop, vanish, respawn queue; hero defeat is a placeholder full heal (`systems/defeat.system.ts`).
- `HudSystem` — draws the heart row for the hero's live HP (`systems/hud.system.ts`).

## 5. Registered Commands and project-ops

### Editor Commands (`packages/engine/src/commands/`)

All scene/map mutations go through `Engine.executeCommand` → op-log →
`COMMAND_EXECUTED` → peers; each command is invertible and serialises to an
`Operation` (`commands/types.ts`, `AGENTS.md` § Transport-ready primitives).
`BUILT_IN_COMMANDS` (`commands/registry.ts`) registers exactly 13 kinds:

| Command kind | Class / file | Effect |
|---|---|---|
| `tile.paint` | `PaintTileCommand` (`commands/paint-tile.command.ts`) | paint one sprite id on a tile |
| `tile.erase` | `EraseTileCommand` (same) | erase a tile |
| `tile.fill` | `FillTileCommand` (same) | flood-fill a contiguous tile region |
| `tile.cells` | `PaintCellsCommand` (same) | paint a list of sprites per cell — the terrain/rect brush path (formerly `tile.stamp`, removed rather than aliased) |
| `object.place` | `PlaceObjectCommand` (`commands/object-placement.command.ts`) | add a placement; same-id re-place is the **update path**, capturing `replaced` for undo — this is how placement moves are done |
| `object.remove` | `RemoveObjectCommand` (same) | remove a placement + despawn its entity |
| `layer.set-visibility` | `SetLayerVisibilityCommand` (`commands/layer-flag.command.ts`) | toggle layer visibility |
| `layer.set-locked` | `SetLayerLockedCommand` (same) | toggle layer lock |
| `layer.add` | `AddLayerCommand` (`commands/layer-lifecycle.command.ts`) | add a layer |
| `layer.rename` | `RenameLayerCommand` (same) | rename a layer |
| `layer.reorder` | `ReorderLayerCommand` (`commands/layer-order.command.ts`) | change layer order |
| `layer.set-plane` | `SetLayerPlaneCommand` (same) | change ground/hero/overlay plane |
| `layer.duplicate` / `layer.remove` | `DuplicateLayerCommand` / `RemoveLayerCommand` (`commands/layer-content.command.ts`) | duplicate/remove layer content |

Not Commands: elevation changes, entity-library edits, the player cast toggle,
sprite-set edits, map create/rename/remove, game-system switches — these are
project-level and ride project-ops instead. Undo/redo lives in
`UndoStackComponent`; an `Operation` carries `kind`, `payload`, `peerId`, `seq`,
optional `direction: 'apply'|'revert'` and `origin` for AI attribution
(`commands/types.ts`).

### Project-ops (`packages/engine/src/sync/project-operations.ts`)

Coarse, idempotent upserts applied straight to `GameProjectData` by the maker's
`ProjectStore` (persist + broadcast + remote-apply); no undo stack, because the
Cast/Library surface has no live scene. All kinds are prefixed `__project/`:

`entity.upsert`, `entity.remove`, `player.set`, `meta.update`, `systems.set`,
`map.editor-data`, `spriteset.add.chunk`, `spriteset.update.chunk`,
`spriteset.remove`, `map.create.chunk`, `map.rename`, `map.remove`, `startup.set`
(constants and create/apply function pairs in `sync/project-operations.ts:50-63`).
Chunked ops let large sprite-set/map JSON cross the wire; `OpChunkReassembler`
and its subclasses live at `sync/project-operations.ts:679-710`.

Collab is live for both human peers (WebRTC) and the in-process AI collaborator
(`AGENTS.md`, `docs/concepts/collaboration-and-multiplayer.md`,
`docs/concepts/ai-collaborator.md`); ephemeral cursor/selection/presence uses the
awareness layer, not the op-log (`sync/awareness.ts`, `sync/remote-cursor-renderer.ts`).

## 6. Runtime details

- **Play modes** — three orthogonal ECS markers on a per-scene `session-state`
  singleton: `EditorModeComponent`, `RuntimeModeComponent`, `SpawnOverrideComponent`
  (`docs/concepts/runtime-modes.md`, `utils/session-state.ts`). `win.play` is Test run
  (`RuntimeMode` + `SpawnOverride`); "Play here" / true Live Run and "Launch full
  game" (new window / WebView) are planned, not shipped (`runtime-modes.md` §§ Where
  this is implemented Phase 4, Mode transitions). `Engine.setRuntimeMode()` /
  `isRuntimeMode()` / `applyPlayZoom()` / `clearSaveState()` / `setTouchInput()`
  (`engine.ts:703-805`); maker actions `play`, `restart`, `play-from-start`
  (`apps/maker-gjs/src/actions/playtest-actions.ts`).
- **Input** — `InputSourceComponent` holds a normalised movement vector plus
  `actionHeld` (talk/interact) and `attackHeld` (hit), deliberately separate
  (`components/input-source.component.ts`). `InputSystem` polls keyboard (plus
  on-canvas `TouchInputComponent` via `Engine.setTouchInput`) and merges intents in
  `utils/player-input.ts`; `PlayerSystem` consumes the component and emits
  `player-tile-changed` / `player-action-pressed` (`systems/input.system.ts`,
  `systems/player.system.ts`, `docs/concepts/runtime-modes.md` Phase 2). Space/Enter
  is the action edge; X is attack (`systems/player.system.ts`, `melee-attack.system.ts`).
- **Camera** — in editor: pan/zoom via `CameraControlSystem` (`systems/camera-control.system.ts`).
  In play: `PlayerSystem.lockCamera()` uses Excalibur `lockToActor` + `MapBoundsCameraStrategy`
  (`runtime/map-bounds-camera.strategy.ts`, arithmetic `utils/play-camera.ts`);
  `Engine.applyPlayZoom()` frames a roomful of tiles. A teleport carries zoom and
  runtime mode (`docs/concepts/runtime-modes.md` § Scene-switch behaviour).
- **Collision during run** — built only while `RuntimeModeComponent` is present:
  `applyRuntimeMode` → `setCollisionActive(scene, active)` flips the physics world and
  every plane tilemap (`services/collision-mode.ts`, `scenes/map.scene.ts:127`,
  `docs/concepts/runtime-modes.md` § Collision follows the run). Walkable tiles use
  `TileProperties.walkable`; blocked tiles bump + emit `on-bump`. There is no jumping
  or ledge system in `systems/`.
- **Animations** — `SpriteSetData.characterAnimations` (directional idle/walk roles +
  custom ids), `CharacterDefinition.animations` deprecated fallback; `PlayerActorComponent`
  holds a role→animation map and `PlayerSystem` swaps roles on facing/motion change
  (`types/data/SpriteSetData.ts`, `CharacterDefinition.ts`, `components/player-actor.component.ts`,
  `systems/player.system.ts`). Tile/object `AnimationData` exists in sprite sets.
- **Interaction** — `TriggerSystem` fires on `walk-onto`, `walk-off`, `action-button`
  (tile adjacent in facing direction), `auto`, with `once`-per-visit; `TriggerFiredComponent`
  marks spent triggers (`systems/trigger.system.ts`). `TriggerSystem.fireAuto` runs at
  scene init regardless of mode — a documented drift gap (`runtime-modes.md` § Systems
  gate themselves). `EventActionSystem` executes the six `ActionData` kinds; `wait` is
  logged only, no sequencer (`systems/event-action.system.ts`).
- **Dialogue** — *partial*: `dialogue` component stores only a `dialogueId` string and
  is never resolved by any system (`entity/specs/dialogue.ts`, `components/dialogue.component.ts`).
  `show-text` emits `SHOW_TEXT_REQUESTED`; the maker renders it as a **toast**
  (`apps/maker-gjs/src/services/engine-event-bridge.ts:92`), and `engine-event-bridge.ts`
  also toasts `flag-set`, `item-picked-up`, `play-sfx`. No dialogue box, portrait,
  typewriter or choice branch anywhere in `packages/engine/src` or `apps/maker-gjs/src`.
- **Save/load** — `GameSaveStateComponent` is a runtime-only flag bag; `FlagSystem`
  writes `set-flag`, `StateSystem` reads it, `Engine.clearSaveState()` resets it
  (`components/game-save-state.component.ts`, `systems/{flag,state}.system.ts`, `engine.ts:758`).
  There is no serialisation to disk, no save slot UI, and no HUD/inventory state in it
  yet (the component's own doc names save/load as separate TODO.md work).
- **Audio** — data-level only: `AudioReference` type, `TileProperties.footstepSound`,
  `play-sfx` action → `PLAY_SFX_REQUESTED` → toast. `WALKED_ONTO_TILE` carries resolved
  tile data but has no audio/encounter listener (`types/reference/AudioReference.ts`,
  `types/data/TileProperties.ts`, `types/engine-events.ts`, `systems/walk-on-tile.system.ts`,
  `apps/maker-gjs/src/services/engine-event-bridge.ts`). No music/ambient or mixer system.
- **UI / HUD** — the only in-engine HUD is `HudSystem`'s heart row for live HP, shipped
  with `combat-action` (`systems/hud.system.ts`, `game-systems/specs/combat-action.ts`);
  it is described as working in the Full Run window and browser export. Everything
  else is GTK chrome (tool group, inspector, toasts), not an in-game UI. No menu,
  inventory screen, shop screen, title screen or credits surface in `apps/maker-gjs/src`
  or `apps/game-browser/src`.
- **Browser host** — `apps/game-browser/src/main.ts` is a minimal `<canvas>` boot: new
  `Engine(canvas)` → `initialize()` → `loadProject('/games/zelda-like/game-project.json')`.
  `apps/game-browser/README.md` calls it the "seed for multi-platform game export";
  no export pipeline, title screen or game menus.

## 7. Editor surfaces

GTK4/libadwaita single-process app (`AGENTS.md`, `apps/maker-gjs/`). Shell
destinations are World / Library / Game plus the map editor; the redesign is
documented in `docs/design/ui-redesign/REDESIGN.md` (the large design brief;
surface names below are from the code).

- **World / Atlas** — `widgets/atlas-view.ts`, `widgets/world/*`: map cards laid out
  by `atlasX/atlasY`, map list, previews/minimap, teleport overlays, FAB/zoom,
  selection bar; `AtlasOverview`, `MiniMap`, `MapPreview` from `@pixelrpg/gjs`.
  Creation/renaming dialogs in `widgets/world/map-dialogs.ts`.
- **Library** — `widgets/library-view.ts` hosts three chip pages (REDESIGN § 4.4):
  **Characters** (`widgets/cast-view.ts`, `widgets/cast/*` — roster, detail,
  is-player toggle), **Things** (`widgets/objects-view.ts`, `widgets/objects/*` —
  gallery grouped by `editorData.category`, new-thing dialog, generated components
  editor), **Graphics** (`widgets/tiles-view.ts`, `widgets/tiles/*` — sprite-set
  cards, tiles, animation roles). Each has a detail pane.
- **Thing templates** (editor presets, not runtime systems) in
  `apps/maker-gjs/src/services/entity-templates.ts`: `npc`, `item`, `teleport`,
  `event`, `chest`, `sign`, `door`, `trigger`, `spawn-point`, `custom` (Blank,
  Full-view only). Game systems add `enemy` and `weapon`
  (`packages/engine/src/game-systems/specs/combat-action.ts`). The `character`
  template is owned by the Cast view.
- **Game page** — `widgets/game-view.ts`, `widgets/game/{checkup-list,game-dialogs}.ts`,
  services `game-checkup.model.ts` / `game-rules-model.ts`: title card with cover
  and "Play from the start", Checkup list (deep links to unfinished items), Start
  pickers for start map + hero, **Rules** group with the game-system switches,
  About/metadata (name, author, version, description, tile size). Explicitly *not*
  an asset browser (REDESIGN § 4.5).
- **Map editor / scene editor** — `widgets/scene-editor-view.ts`,
  `widgets/scene-editor/{inspector-wiring,object-descriptors,door-target-dialog}.ts`;
  tool rail from `@pixelrpg/gjs`'s `widgets/editor/tool-group.ts`: `select`, `pencil`,
  `fill`, `eraser`, `eyedropper`, `object` (phone strips to the first four). Layers,
  planes, visibility/lock, terrain brush, wall hatching, placement selection/
  context menu, "Goes to…" door-target pick, undo/redo. Hover previews in
  `systems/hover-overlays.ts` and `services/{pencil,fill,eraser,object}-preview.ts`.
- **Collab** — `widgets/together-dialog.ts` (session roster, invite/copy, follow a
  peer, stop, AI toggle), `services/collab-session.ts`, awareness/cursor/presence
  services, `sync/*`. WebRTC pair editing is live (`docs/concepts/collaboration-and-multiplayer.md`).
- **AI collaborator** — in-process virtual peer driving the editor via D-Bus/MCP
  (`docs/concepts/ai-collaborator.md`), with `services/assistant-state.service.ts`,
  assistant pause policy, `Engine.setAssistantCursor/info/hide` (`engine.ts:552-598`),
  peer-flash on its edits (`services/peer-edit-flash.ts`). The bridge app is
  `apps/mcp-bridge/` (`AGENTS.md`).
- **Localisation** — the *maker's* UI is gettext-based (`gettext as _` throughout
  `apps/maker-gjs/src`, game-system labels are msgids `game-system-spec.ts`). No
  mechanism exists for translating *game text* authored in a project: action
  `show-text.text`, entity names, dialogue ids and map names are plain strings
  (`types/data/ActionData.ts`, `EntityDefinition.ts`, `MapData.ts`).

## 8. Relevant open TODO.md items

Grouped by game-facing area; line numbers refer to this checkout's `TODO.md`.

**Gameplay / game systems**
- "Real runtime effect systems (dialogue / inventory / audio)" — `show-text`,
  `item-picked-up`, `flag-set`, `play-sfx` are playtest toasts only; flags store
  landed, but no text-box overlay, inventory bag (`InventoryComponent`, `item-def`
  library entities, `INVENTORY_CHANGED`) or audio layer (`TODO.md:60`).
- "`inventory` has no bag yet" — pickup fires and toasts; nothing holds the item
  (`TODO.md:62`).
- "State overlays are actions-only" — a flag-gated door teleports but never *looks*
  open; chest stays visually closed; "Only when …" authoring row missing
  (`TODO.md:61`).
- "`combat-action` leaves three gaps" — no real game over (hero is full-healed),
  `stats.speed` not shipped (reader would be `combat-turn`'s `TurnOrderSystem`), no
  destructive "Remove data" row for dormant systems (`TODO.md:63`).
- "Three engine components are built on every spawn and read by nothing" —
  `CollisionComponent` has no effect (player walks through chests/signs/doors),
  `SpriteRefComponent` runtime writes do nothing, `CustomDataComponent` inert by
  design; peaceful NPC still stands still — no general `NpcMovementSystem`
  (`TODO.md:59`).
- "Per-player input sources (gamepad / remote / AI)" — per-player source descriptors
  await split-screen / remote players (`TODO.md:64`).
- "Audio is not a place in the app (rail row removed 2026-09-05)" — the `audio` rail
  row advertised a view that never existed (`TODO.md:21`).
- "Map settings has no music / encounters / on-enter rows" — `MapData` has no fields
  for them; needs a schema + product decision (`TODO.md:34`).
- "Elevation runtime (the bridge)" — `elevation` typed but no behaviour; per-storey
  tilemaps, elevation components + system, stairs, floor switcher all open
  (`TODO.md:50`).
- "Live Run … open: O5, O7" and "Runtime modes — Editor / Full Run / Live Run" —
  full-window run + WebView variant, true Live Run entry point still open
  (`TODO.md:48`, `51`; `docs/concepts/runtime-modes.md` Phase 4).
- "No entry point for a wide Live Run" and "Play here opens at the editor's zoom"
  (`TODO.md:70-71`).

**Systems planned in the concept docs (not in TODO.md's top sections)**
`docs/concepts/game-systems.md` § Reach: `combat-turn` (second scene, encounter
tables, party, skills), `economy` + `time` (shop, crop, tool, stamina, clock,
schedule), regions as a map primitive, per-system config/per-map fields/starter
packs, non-actions state overlays, user-defined component schemas and the
TypeScript script tier. No title screen, credits, vehicle, jumping, weather,
cutscene, quest or localisation-of-game-text system is named in `TODO.md` or the
concept docs *(inferred: these are simply not scoped yet)*.

**Editor/tooling items adjacent to game features**
- "Library gallery gaps" and "Tileset editor follow-ups" (`TODO.md:16`, `28`).
- "Moving a placement is a tap, not a drag" (`TODO.md:30`).
- "MCP orchestrator … follow-ups" — `render_map`, blocking `open_scene`, generic
  `get_components` (`TODO.md:20`); "Assistant pause / control-plane follow-ups"
  (`TODO.md:19`).
- "Touch run controls — follow-ups" — quantized stick, one action button, no
  touch-controls preference row (`TODO.md:69`).
- "Terrain brushes … T0–T8 done except more pack cards" (`TODO.md:40`) — autotiling
  itself is implemented.

## 9. Flat concept checklist

"Where" cites the nearest authoritative path. `have` = working end to end in the
engine today (opt-in systems marked); `partial` = data/template/intent exists but a
runtime piece or authoring surface is missing; `none` = no implementation found.

| Concept | Status | Where |
|---|---|---|
| Switches / flags | have (runtime-only) | `components/game-save-state.component.ts`, `systems/flag.system.ts`, `ActionData.ts` (`set-flag`); reset by `Engine.clearSaveState()` |
| Variables | partial | `FlagValue = boolean\|number\|string` in `types/data/EntityDefinition.ts`; `set-flag` takes a value, but there is no variable editor, arithmetic or naming tier |
| Events / triggers | have | `entity/specs/trigger.ts` (`on: walk-onto\|walk-off\|action-button\|auto\|none`, `once`), `systems/trigger.system.ts`, `systems/event-action.system.ts` |
| Conditions | partial | `EntityState.when = { flag, equals? }` — one flat equality, no expression DSL (`types/data/EntityDefinition.ts`, `systems/state.system.ts`); no authoring row (`TODO.md:61`) |
| Dialogue / messages | partial | `show-text` → `SHOW_TEXT_REQUESTED` (`types/data/ActionData.ts`, `systems/event-action.system.ts`) → GTK toast (`apps/maker-gjs/src/services/engine-event-bridge.ts`); `dialogue` component is an unresolved id only; no text box |
| Choices | none | no choice action in `ACTION_TYPES`, no branch event in `types/engine-events.ts` |
| Signs | partial | `sign` template with action-button trigger + `show-text` (`apps/maker-gjs/src/services/entity-templates.ts`); no stored line, toast only |
| NPC movement routes | partial | `NpcRouteComponent` waypoints, `entity/specs/npc-route.ts`; consumed by `HostileAiSystem` patrol only; no general `NpcMovementSystem` (`TODO.md:59`) |
| Doors / transfers | have | `teleport` + `trigger` (`entity/specs/teleport.ts`), `TeleportSystem`, `Engine.loader.teleport` (`engine.ts:208`), atlas "Goes to" (`widgets/scene-editor/door-target-dialog.ts`) |
| Items / inventory | partial | `item` component, `ItemPickupSystem`, `give-item` action; no bag (`InventoryComponent`) — `TODO.md:21`, `62` |
| Shops | none | `economy` game system planned, not registered (`docs/concepts/game-systems.md` § Reach) |
| Enemies | have (opt-in system) | `combat-action` `enemy` template, `hostile`/`hurtbox`, `HostileAiSystem` (`game-systems/specs/combat-action.ts`) |
| Combat | partial (real-time only) | melee/aggro/knockback/defeat (`systems/{melee-attack,hostile-ai,knockback,defeat}.system.ts`); turn-based `combat-turn` planned |
| HP / stats | have | `stats` spec, `StatsSystem`, `DAMAGE_DEALT`/`ENTITY_DEFEATED`/`LEVEL_UP` (`entity/specs/stats.ts`, `systems/stats.system.ts`) |
| Jumping | none | no jump component/system in `components/` or `systems/` |
| Ledges | none | `LayerPlane` is draw-depth only (`types/data/LayerData.ts`); `elevation` typed, no runtime (`TODO.md:50`) |
| Vehicles | none | no vehicle component/template/system found |
| Save / load | partial | `GameSaveStateComponent` flags + `clearSaveState()` (`engine.ts:758`); no disk persistence or slots |
| Title screen | none | `widgets/game-view.ts` is an editor page, not an in-game title; browser host boots straight into the demo (`apps/game-browser/src/main.ts`) |
| HUD | partial | `HudSystem` heart row only, shipped with `combat-action` (`systems/hud.system.ts`) |
| Menus | none | no in-game menu scene; `apps/maker-gjs/src/widgets/` is editor chrome |
| Audio | partial (data only) | `AudioReference`, `TileProperties.footstepSound`, `PLAY_SFX_REQUESTED` → toast (`apps/maker-gjs/src/services/engine-event-bridge.ts`); no audio layer |
| Weather / screen effects | none | no weather/screen-effect component or system; visual editor flags are editor-only (`components/editor-view-mode.component.ts`) |
| Cutscenes | none | `wait` action is logged, no sequencer (`systems/event-action.system.ts`); no scene-scripting system |
| Quests | partial (encoding only) | flags + `EntityState.when` can encode stages (`types/data/EntityDefinition.ts`); no quest data or system |
| Encounters | partial (data/hook only) | `TileProperties.encounterTable`, `WALKED_ONTO_TILE` event with no listener (`types/data/TileProperties.ts`, `systems/walk-on-tile.system.ts`); `combat-turn` planned |
| Plugins / scripting | partial | `script` component is a no-runtime marker (`entity/specs/script.ts`), `custom-data` escape hatch, third-party game systems registerable in code (`game-systems/registry.ts`); no user script tier/sandbox (`docs/concepts/entity-and-appearance-model.md` Open questions) |
| Localisation of game text | none | only maker UI is gettext (`apps/maker-gjs/src`, `game-system-spec.ts`); authored strings are plain JSON |
| Credits | none | `games/zelda-like/CREDITS.md` is asset licensing for the template, not an in-game credits screen |
| Tileset autotile / terrain | have | `TerrainData`, presets, `terrain-paint.service.ts`, `tile.cells` command (`types/data/TerrainData.ts`, TODO.md T0–T8) |
| Map links / atlas | have | `teleport`/`spawn-point` placements, `atlasX/atlasY`, map categories, connection lines (`widgets/atlas-view.ts`) |
| Collision | partial | tile `walkable` + runtime-only colliders (`TileProperties.ts`, `services/collision-mode.ts`); `CollisionComponent` on placements is inert per `TODO.md:59` |
| Leveling / XP | have | `StatsSystem` emits `EXPERIENCE_GAINED` / `LEVEL_UP` (`stats.system.ts`) |
| Conditional object states | partial | `states` overlays run for `actions` only; visual/collision overlays inert (`types/data/EntityDefinition.ts`, `TODO.md:61`) |

## Sources consulted

- `AGENTS.md`, `TODO.md`
- `docs/concepts/*.md`, `docs/design/ui-redesign/REDESIGN.md`, `TERRAIN.md`
- `packages/engine/src/**` (format, types/data, game-systems, components, systems,
  commands, runtime, scenes, services)
- `apps/maker-gjs/src/**` (top-level views), `apps/game-browser/**`
