# Entity Composition & Appearance Model

> Status: tracked in the [migration phases](#migration-phases) table — the single source of truth for what's landed vs planned. This is the agreed content model (direction decided 2026-06-09); its composition phases (A–C6) have landed and replaced the old `ObjectKind`-switch + `ObjectProperties` union, so this doc — not [`object-system.md`](object-system.md) — owns composition.

## Why a target model

Two findings forced this document:

1. **Two parallel entity systems.** The Cast view (PRs #145–#158) models characters as `CharacterDefinition`; the object system models NPCs/items/teleports as `ObjectDefinition`. Both model "an NPC", "a player", "a thing with behaviour". Every further Cast feature deepens the split.
2. **`kind` as a composition switch doesn't scale.** The shipped `ObjectSpawnSystem` composes components via a `kind`-switch over a kind-discriminated `properties` union. Every new capability needs a new switch arm *in engine code* — which walls off the planned **built-in code editor** (user-defined behaviour can never enter the switch) and made even our own "place a character as an NPC" question awkward.

The engine we shipped was an exploratory prototype (by design). What carries over and what changes:

| Keep (proven) | Replace (prototype) |
|---|---|
| Definition/Placement split | `ObjectKind` as composition driver |
| wholesale-replace override semantics | `ObjectProperties` discriminated union |
| stable IDs everywhere; data-only components; logic-only systems; event bus | `kind`-switch in `ObjectSpawnSystem` |
| tiles as batched `TileMap` + per-sprite `TileProperties` | `CharacterDefinition` as a separate schema |
| session-singleton, `__project/*` channel, `Command` op-log | `SpriteRef`-only visuals (no animation playback) |

## The model

Prior art, deliberately: **flecs prefabs / Minecraft-Bedrock component bags** (explicit component lists on data-driven definitions), **RPG-Maker database** (templates as the approachable authoring surface), **RPG-Maker event pages, modernised** (declarative states), on the existing **Excalibur ECS** runtime (Overwatch-style data/logic split).

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

An **Appearance** is today's `SpriteSetData { kind:'character' }` — image + grid + `characterAnimations` + the uniform body collision box — renamed and treated as a first-class library asset next to Tilesets. The Cast "Sprite sheet" editor already produces exactly this; it moves conceptually into the asset library instead of being a peer tab of Character. `CharacterAnimation` is `{ id, frames: AnimationFrame[], loop? }` — each frame carries its own `{ spriteId, duration }`, sharing the frame shape with the tile/object `AnimationData` (the animation timeline editor tunes duration per frame). No file split for Layer 0 until two appearances genuinely share one image (YAGNI).

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
- **A "character" is just a definition** with `visual` + `movement` (+ optionally `dialogue`/`npc-route`/`trigger`), tagged `editorData.template === 'character'`. The hero/NPC distinction is derived (`playerActorId` vs placed with NPC components).

> **Design note — `CharacterDefinition` as a view model (landed B2).** The *persisted* parallel character schema is gone: `GameProjectData.characters[]` was removed; characters live in `entityLibrary`. But the type `CharacterDefinition` **survives as a flat, non-persisted Cast view model** — the Cast widgets (`CharacterPreview`, `AnimationList`, `CastInspector`, …) and `PlayerSystem` consume it, and `entity/convert.ts` maps it ↔ the entity (`entityToCharacter` / `characterToEntity`). This honours the architecture (one *persisted* model; scripts attach to entities) at far lower risk than rewriting the just-built Cast subsystem against raw `components[]`, and it *is* the concept's progressive-disclosure rule: the friendly surface uses a simple view model, the advanced surface (Phase C's generated inspector) edits `components[]` directly. The literal "delete `CharacterDefinition`" can still happen later if the Cast UI is fully rebased onto the generated inspector — but it buys nothing architecturally.

### The component registry

As shipped (`packages/engine/src/entity/component-spec.ts`):

```ts
interface ComponentSpec {
  type: string                                    // 'visual', 'movement', …
  fields: readonly FieldDescriptor[]              // validation + GENERATED inspector UI
  editor: ComponentEditorMeta                     // label, icon, markerColor, disclosure tier
  build: (data: ComponentData, ctx: SpawnContext) => Component | Component[] | null
  validate?: (data: ComponentData) => string[]    // deep check for `json` fields
}
```

The design sketch said `schema: JSONSchema`; what landed is a **flat field
DSL** — `FieldDescriptor[]`, one entry per editable key, each naming a
`FieldInput` (`text` / `int` / `float` / `bool` / `select` / `json` /
`appearance-ref` / `map-ref` / `facing` / …). It is strictly less
expressive than JSON Schema and deliberately so: every descriptor maps to
exactly one inspector row, so the generated UI needs no schema
interpreter. The one shape it cannot express — a heterogeneous list
behind a `json` field, e.g. the `actions` component's
discriminated-union entries — gets the optional `validate` hook instead.
`build` returns `null` for data-only components that carry no runtime
component (`movement`, read from the definition by `PlayerSystem`).

- Engine ships the built-in specs (visual, movement, collision, trigger, teleport, item, dialogue, npc-route, spawn-point, custom-data, script, actions, stats). Each declares `system:` — the **game system that owns it** — and `BUILT_IN_COMPONENT_SPECS` is derived from the `specs/` barrel rather than hand-listed, with an ownership guard failing CI on an unowned or doubly-owned spec. Which of them a given project may actually use is `effectiveComponentRegistry(project)`; see [`game-systems.md`](game-systems.md).
- **The inspector is generated from `fields`** — no per-kind hand-built inspector pages. `editor.basic` and `FieldDescriptor.basic` mark which fields/components a template surfaces by default (progressive disclosure lives in data, not just in UI code) — **but nothing reads either flag yet**: the disclosure tier is declared on 12 fields and 3 components and is read nowhere in `apps/` or `packages/` (TODO.md, "Cleanup / debt").
- **The future code editor registers new specs** through the same registry. User components are first-class, not bolted on.
- Registry mirrors the existing `BUILT_IN_COMMANDS` registry discipline: a component type that isn't registered fails validation loudly (no silent-skip). A type that IS registered but whose game system the project switched off is *dormant* instead — preserved, inert, reported apart from errors. Merging the two would make a typo silent or a switch destructive.

### Templates (the "RPG-Maker database" surface)

A **template** is an editor-side preset: a named starter `components[]` + which fields are "basic". `NPC` = visual+movement+npc-route+trigger; `Item` = visual+item+trigger; `Teleport` = trigger+teleport; `Spawn point` = spawn-point. Beginners pick a template, fill 3 friendly fields, never see a component. Power users open the full component list on the same definition. **Zero engine semantics** — `editorData.template` is a label for the editor; deleting it changes nothing at runtime. New templates are content, not code.

### States (conditional overlays — the no-code behaviour tier)

RPG Maker's most-loved feature is event *pages*: same object, different appearance/behaviour per condition. Modernised, declarative, collab-deterministic:

```ts
interface EntityState {
  id: string                  // 'open', 'night', 'quest-done'
  when?: StateCondition       // { flag, equals? } — first matching state wins; no `when` = manual/scripted switch
  components: ComponentData[] // overlays base components, wholesale-replace PER TYPE (same override discipline as placements)
}
```

A door (closed/open), a day/night NPC, a quest-stage marker. State evaluation is `StateSystem` (`packages/engine/src/systems/state.system.ts`) reading the flag store `FlagSystem` folds `FLAG_SET` into (`GameSaveStateComponent` on the session singleton).

The condition vocabulary is **exactly one shape**, `{ flag: string; equals?: boolean | number | string }` with `equals` defaulting to `true` — the same one-flat-equality discipline the conditional-row design uses. An expression DSL nobody validates is refused. Any other `when` is a validation warning and never matches, so a project from a newer editor still opens.

**Actions only, so far.** `StateSystem` swaps the entity's `actions` list, which is what makes the key-and-door loop work end to end; a state carrying any other component type validates with a warning and is inert at runtime. The visible cost is real: a door teleports once the flag is set but never *looks* open, and a chest still looks closed after it gave you its item. Applying a `visual` / `collision` overlay means rebuilding a live entity mid-frame while keeping its runtime companions alive — its own piece of work, see [`game-systems.md`](game-systems.md) and TODO.md.

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
- `PlayerSystem` (spawn handling) instantiates it at the `spawn-point { spawnId:'player' }` placement and attaches the **existing** `PlayerComponent` marker + `PlayerActorComponent` (runtime state: facing, speed, role-indexed animations).
- Simple-maker case stays one toggle in the Cast detail ("is the default player?" → writes `playerActorId`).

## Editor surfaces

- **Sheets view** — the unified sprite-sheet editor + the canonical home of appearance/animation editing (landed C5; the former Tiles view, relabelled). Two stacked card galleries: **Tilesets** (→ the tile-property inspector) and **Appearances** (→ the animation editor: preview + animation list + duration). Appearance import lives here too. (The Data view still *lists* both kinds as assets; opening one jumps here via `win.open-appearance` / `win.open-tileset`.)
- **Objects view** — the **general** lens (landed C6): a master-detail list over EVERY `entityLibrary` entry (world objects AND `character`-template cast members, the latter flagged with a "Cast" badge), edited raw through the generated component inspector. Also the placement source: the scene-editor Objects tab shows a **visual brush palette** (sprite-thumbnail cards of every entity except the player actor, so Cast NPCs are placeable; the player spawns at its spawn-point) — single-click a card to arm the brush, then stamp on the canvas. (`win.set-inspector-tab` switches the scene inspector tab for tooling.)
- **Cast view** — the **specialised** friendly lens over the character subset of the same library: name, Appearance **picker**, speed, player toggle; components/states/scripts behind the "all components" disclosure; an **"Edit appearance →"** deep-link into the Sheets animation editor. The sheet gallery + animation editor moved out to the Sheets view (C5). Cast + Objects edits cross-refresh via the shared `ProjectStore`'s `entity-library-changed` event since they overlap.
- **Cast membership is a toggle, not a separate type** — there's ONE NPC concept. The Objects detail carries a **"Cast member"** switch (shown only for entities with a real appearance) that flips `editorData.template` ↔ `'character'`: promote a world object into the friendly Cast roster, or demote it back. Resolves the "is it a Cast-NPC or an Objects-NPC?" confusion — it's the same entity; the toggle decides which lens treats it as a friendly character. (`win.toggle-object-cast <id>` is the driveable form.)

## Migration phases

| # | Scope | Status |
|---|---|---|
| A | **UI/naming, no schema break** — "Sprite sheets" → "Appearances" (labels only, incl. Data view + import dialog); deep-link "Edit appearance" row (+ "Used by N characters") from the character detail to the appearance editor. Relocating the animation-editor page into the Library view rides Phase B/C's view work. | **landed** |
| B0 | **Component registry + field DSL (engine)** — `entity/component-spec.ts` (`ComponentSpec` + `FieldDescriptor`), 11 built-in specs, `BUILT_IN_COMPONENT_SPECS`, `validateEntityDefinition`. | **landed** |
| B1 | **Composition refactor — objects (engine)** — `EntityDefinition.components[]`; `ObjectSpawnSystem` kind-switch → registry walk (`entity/spawn-placement.ts`); `ObjectProperties` union + `blocking` dissolve into component data; `objectLibrary` → `entityLibrary`; `ObjectDefinition` + `ObjectKind` deleted; `scripts/migrate-to-entity-components.mjs` migrated all `games/*`; format validators reject unregistered component types. | **landed** |
| B2 | **Composition refactor — characters (engine + maker)** — `GameProjectData.characters[]` migrated → `entityLibrary` (`character`-template entities with `visual` + `movement`); `isPlayer` → `playerActorId`; collab ops `character.*` → `entity.upsert`/`entity.remove`/`player.set`; player resolution via `playerActorId` + `entityToCharacter`. **`CharacterDefinition` survives as a non-persisted Cast view model** (mapped ↔ entity via `entity/convert.ts`), not deleted — see design note below. | **landed** |
| C1 | **Generated component inspectors** — `ComponentInspector` + `EntityComponentsEditor` (rows from the field DSL); story. | **landed** |
| C2 | **Objects library view + templates** — `Objects` editor mode + master-detail view (`objects-view`), `ObjectsController` (CRUD on the `entityLibrary`, `entity.upsert`/`entity.remove` collab), `entity-templates.ts` (NPC / item / teleport / event / spawn-point / blank), `win.new-object` / `win.open-object` actions, MCP `set_view objects`. | **landed** |
| C3a | **Placement commands (engine)** — `PlaceObjectCommand` / `RemoveObjectCommand` (registered, undoable, collab-reconstructible) + `MapScene.spawnPlacement` / `despawnPlacement` (live spawn/despawn via the registry). | **landed** |
| C3b | **Object placement tool** — the `object` editor tool (FloatingTopBar) + `ActiveObjectComponent` brush + `TileEditorSystem` click→`PlaceObjectCommand`; Objects-inspector brush picker → `win.set-object-brush`; `Engine.placeObjectAt` + DBus `PlaceObject` + MCP `place_object` (driveable). | **landed** |
| C4 | **Cast view "all components" disclosure** — the cast detail gains a collapsed `EntityComponentsEditor` disclosure editing the character's raw `components[]`; the friendly inspector (name / appearance / speed) now **merges** onto the existing entity (`mergeCharacterIntoEntity`) so it never drops disclosure-added components. (New-character already seeds the `character` component set via `characterToEntity`.) | **landed** |
| C5 | **Sheets-view unification (maker)** — the Tiles view becomes the unified **Sheets** view; appearances + the animation editor relocate from Cast into it (one editor for both sprite-sheet kinds — Tilesets + Appearances). Cast slims to a Characters-only lens (appearance picker + "Edit appearance" deep-link via `win.open-appearance`). Appearance data still owned by `CastController` (pushed via its `appearances-changed` event; animation mutations route back through its public methods, which persist + broadcast via the shared `ProjectStore`); appearance import + `win.new-animation` + Data "open appearance" all route to the Sheets view; `win.open-sheet` removed. | **landed** |
| C6 | **Objects = general lens (maker)** — Objects lists EVERY entity (drop the `!isCharacterEntity` filter), characters flagged with a "Cast" badge + person icon; the scene-editor object brush lists every entity except the player actor (Cast NPCs become placeable). Cast stays the specialised character-only lens; the two lenses cross-refresh via the `ProjectStore`'s `entity-library-changed` event since they now overlap on the shared library. The friendly Cast picker still restricts to character sheets; the general Objects inspector exposes the raw `appearance-ref` (any sprite-set + index — a tileset tile works as an item's look). | **landed** |
| D | **States** — `EntityState` + `StateSystem` + flags vocabulary. Landed: the flag store (`GameSaveStateComponent` + `FlagSystem`, giving the never-heard `FLAG_SET` its first reader), `EntityStatesComponent` attached by the spawn pipeline, `StateSystem` resolving the first matching state per tick under `RuntimeModeComponent`, and the one-shape `StateCondition` vocabulary with warn-don't-fail validation. Still open: overlays of component types other than `actions` (live sprite + collider rebuild), and the "Only when …" authoring row. | **partly landed** |
| E | **Code editor** — script representation (likely TS — the whole stack is TS and gjsify can bundle/run it; sandboxing TBD), `script` component spec, editor surface. The `scriptId` seam already exists on `trigger`. | **planned** |

Phases B+C land together or B slightly ahead; do **not** build the object-tool UX on the kind model first (it would be built twice).

## Transport / collab

Unchanged in principle, restated for the new shapes: entity definitions, appearances, templates and states are **project-level** data → `__project/*` ops (coarse, idempotent upserts — like `__project/spriteset.update.chunk`, PR #156). Placements are scene state → `Command` op-log (undo + peers). State *switches* at runtime are gameplay events → op-log once multiplayer game-ops land. All five transport constraints in `AGENTS.md` apply to every new shape here (stable ids, operation-oriented mutation, JSON-serialisable, no circular refs, awareness for ephemeral presence).

## Open questions

1. ~~**Condition vocabulary for states**~~ — **decided**: exactly one shape, `{ flag, equals? }`, `equals` defaulting to `true`. Not an expression DSL — a second language nobody validates. Richer conditions (a time-of-day condition beside the flag one) arrive with the system that has a clock to read.
2. **Multiple appearances per entity** (paperdoll/equipment) — `Visual` stays single; the union leaves room for a `layers` variant later.
3. **Script sandboxing** — TS in-process vs sandboxed; decide at Phase E (object-system.md carries the same question).
4. **Definition variants** (`extends`, Unity-prefab-variant style: "guard" extends "villager") — deliberately **not** in v1; single-level prototype→instance (definition→placement) must prove insufficient first.

## Cross-references

- [`object-system.md`](object-system.md) — describes what this sits on; placements/overrides/tiles/z-order/systems/bus carry over verbatim (its historical composition sections were pruned once Phase B landed).
- [`editor-architecture.md`](editor-architecture.md) — ECS-as-model; generated inspectors and definition editing are views over the same world.
- [`runtime-modes.md`](runtime-modes.md) — trigger/state/script effects only run in runtime mode (today indirectly, via the `RuntimeModeComponent`-gated `PlayerSystem` events — see that doc's gating note).
- [`game-systems.md`](game-systems.md) — who OWNS each component spec, which of them a project may use, and the flag store + state runtime this doc's Phase D describes.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — op channels + transport constraints for every shape above.
