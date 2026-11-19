# RPG Maker concepts for PixelRPG Maker

Status: planning · 2026-11-19

This document maps the concepts of classic RPG makers and one open-source monster game onto PixelRPG Maker's own model: game systems, components, registered Commands and `__project/*` project-ops. It marks what we already have, what is missing, and what we deliberately skip. It ends in an ordered roadmap and a short list of questions only the owner can answer. Concepts are described in our own words; nothing is copied from any maker's help or code.

## Sources

Six research reports in [`rpg-maker-research/`](rpg-maker-research/). Citations use the file name and section, e.g. `(mz.md §3)`. Three names are shortened: `ux.md` = [editor-ux-and-evolution.md](rpg-maker-research/editor-ux-and-evolution.md), `2k3.md` = [rm2003-easyrpg.md](rpg-maker-research/rm2003-easyrpg.md), `inv.md` = [pixelrpg-inventory.md](rpg-maker-research/pixelrpg-inventory.md).

- [mz.md](rpg-maker-research/mz.md) — MZ data model and runtime. Tile-flag bits, save-slot count and battle-formula internals are from memory and treated as unverified.
- [ux.md](rpg-maker-research/editor-ux-and-evolution.md) — editor UX, 2003 → VX Ace → MV → MZ. Correction: RM2003 has 15 save slots, not 16 (`2k3.md §2`).
- [2k3.md](rpg-maker-research/rm2003-easyrpg.md) — RM2003 through the EasyRPG sources.
- [tuxemon.md](rpg-maker-research/tuxemon.md) — monster-game concepts and the real-time vs turn-based assessment.
- [oot2d-comparison.md](rpg-maker-research/oot2d-comparison.md) — our Kokiri port against the original. The "orchestrator review" notes in §2.4 and fix #1 override the agent's first claims.
- [inv.md](rpg-maker-research/pixelrpg-inventory.md) — what we have today. Its §9 checklist is the status baseline.

Binding repo context: `AGENTS.md` (Game systems · Engine patterns — ECS · Transport-ready primitives) and [concepts/game-systems.md](concepts/game-systems.md).

## 1. How to read this

| Status | Meaning |
|---|---|
| **have** | Works end to end in the engine today (opt-in systems count, if the system exists). |
| **partial** | Data, template or intent exists; a runtime reader or an authoring surface is missing. |
| **gap** | Nothing found in the inventory. |
| **skip** | Deliberately not doing. The reason is in the row and in §5. |

Priority: **P1** blocks a child from finishing a small playable game (talk, remember, look right, save). **P2** makes games richer or the editor easier. **P3** is optional, later, or an optional game system.

Proposal rules, from `AGENTS.md`, that every row obeys:

- A new component names its owner in `system:` and is listed in that system's `components`, or CI blocks it.
- A new editor mutation on a live scene is a registered `Command` (`BUILT_IN_COMMANDS`, `registry.spec.ts`). Project-level data (library, flags, UI skin, texts) rides a `__project/*` op through `ProjectStore`. Playtest and save state is neither: it is scene-lifetime, off the undo stack and off the wire.
- Cross-system talk goes over the engine event bus. Persistent keys are stable ids, never Excalibur `Entity.id`.
- Every game system needs a `kidLabel`, one sentence a nine-year-old can read. A system that cannot say its purpose in one sentence is the wrong size.

**Where the reports disagree** (the pick is used below):

| Topic | Disagreement | Pick |
|---|---|---|
| Save slots | RM2003 16 (`ux.md §3`, unverified) vs 15 (`2k3.md §2`, source-confirmed); MZ 20 (`mz.md §10`, unverified) | 15 for RM2003. Irrelevant for us: we skip numbered slot lists (§5). |
| RM2003 native size | 320×240 "unverified" (`ux.md §3`) vs confirmed with 16 px tiles (`2k3.md §2`) | `2k3.md`: it cites the runtime constants. |
| Trigger count | five in MZ and RM2003 (`mz.md §3`, `2k3.md §3`) vs "reduce to three for kids" (`ux.md §4.3`) | Both: four child-facing triggers in our model, no autorun/parallel (§3.1). |
| Battle style | MZ sketches a small turn-based battle as the sweet spot (`mz.md §8`); Tuxemon report recommends real-time on the live core (`tuxemon.md §7.2`) | Tuxemon report: we already ship real-time combat (`inv.md §3`), so turn-based is the extra system, not the default (§3.9). |
| Page order | All sources: the last matching page wins. Our `StateSystem` resolves the first matching state (`inv.md §4`). | Ours stays: top-to-bottom "first rule that fits" reads naturally (§3.1). |
| Walk speed | Original `12` vs port `6` looks like half speed (`oot2d-comparison.md §3.1`) | The review: both are 6 tiles/s. Do not change it. |
| House depth | Original's Y-sort axis declared, but sort mode is Default (`oot2d-comparison.md §1.3` vs `§2.4` review) | Unverified. Do not build on "the original does it" (§3.10). |

## 2. Concept matrix

Columns: concept · what the makers do · our status and path · proposal in our model · priority. Paths are from `inv.md`.

### 2.1 Events and logic

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Event = object with trigger and command list `(mz.md §3)` | A placed object runs a list when triggered; the heart of "make a story". | **have** — `trigger` + `actions` components; `systems/trigger.system.ts`, `event-action.system.ts`. | Keep. Surface as "Things" with plain trigger names (§3.1). | P2 |
| Trigger set `(mz.md §3, 2k3.md §3, ux.md §4.3)` | Five: action, touch, event-touch, autorun, parallel. | **have** — `on: walk-onto \| walk-off \| action-button \| auto \| none` (`entity/specs/trigger.ts`). | Kid names: *When tapped · When stepped on · When left · Starts once by itself*. No autorun or parallel (§5). | P2 |
| Conditional states, "pages" `(mz.md §3, ux.md §2.1)` | Pages with conditions; last match wins; invisible state machine. | **partial** — `EntityState.when` flat; only `actions` overlays run (`TODO.md:61`). | Labelled state cards "closed / open" with a "when…" sentence and a live "active now" badge. Add `visual` and `collision` overlays (needs a live sprite and collider rebuild). | P1 |
| Rich conditions `(2k3.md §3, ux.md §2.5)` | Switch, variable compare (six operators in RM2003), item, actor, timer; MZ only has ≥. | **partial** — one `{flag, equals}`. | Typed union: flag, counter compare (all six operators), has-item(count), in-party, all/any/not (§3.1). | P1 |
| Local state (self switch) `(mz.md §3, ux.md §2.6)` | Four hidden per-event booleans A–D; people burn global switches instead. | **gap** | Named per-placement flags ("opened"), keyed `placementId + name` in the save state. Templates create them; the user never types a letter (§3.2). | P1 |
| Global switches and variables `(mz.md §5, 2k3.md §1)` | Numbered global cells; names are cosmetic. | **have** (flags, runtime-only) / **partial** (variables) — `GameSaveStateComponent`, `FlagValue = boolean\|number\|string`. | Named project-data registry, picked from a list, created on demand, never numbers (§3.2). | P1 |
| Command list as nested blocks `(2k3.md §4.11, mz.md §4)` | Flat list with an indent and structural markers. | **partial** — flat six-kind `ActionData[]`. | Nested block tree: `if/else`, `ask` (choices) and bounded `repeat` are real containers. Stable text ids per kind, no numeric codes (§3.1). | P1 |
| Curated command set `(mz.md §4, ux.md §2.3)` | About 110 commands in a three-tab dialog. | **partial** — six: `show-text`, `teleport`, `give-item`, `set-flag`, `play-sfx`, `wait` (`ActionData.ts`). | About 28 blocks across Say · Ask · Give/Take · Go · Wait · Sound · Move · Screen · Fight · Shop · Flags. List in §3.1. | P1 |
| Common events / routines `(mz.md §5, 2k3.md §1)` | Named reusable list, optional always-on trigger. | **gap** | Library "Routines" (named block list, callable). Rides `__project/routine.upsert`. No always-running mode. | P2 |
| Autorun and parallel `(mz.md §5, ux.md §2.6)` | Blocking or concurrent loops; classic freeze and lag source. | **skip** | See §5. A "cutscene" is a bounded sequence, "always check" is a state condition. | — |
| Labels, jumps, free loops `(mz.md §5)` | Goto-style flow. | **skip** | `if` and bounded `repeat` cover it. | — |
| Waiting and timing `(2k3.md §6)` | Frame waits, key waits, wait-for-movement; the whole wait state is saved. | **partial** — `wait` is logged only; no sequencer. | `EventActionSystem` becomes a real sequencer: blocking steps with a cursor on an `ActionRun` runtime component (§2.12). | P1 |
| Remove or spawn a thing at runtime `(mz.md §4, 2k3.md §7)` | Erase event; EasyRPG adds clone/destroy. | **gap** | `vanish` block (per-placement flag `removed`); `appear` via states. No free-form spawning. | P2 |
| Quests `(tuxemon.md §1)` | Mission rows with ordered steps, prerequisites, optional steps. | **partial** — flags plus `when` can encode stages. | Optional system `quests`: steps are named flags, journal text per step, a tick HUD. | P3 |
| Event timer `(mz.md §10)` | One global countdown. | **gap** | Optional `timer` counter with a HUD readout; P3 challenge feature. | P3 |
| "Where is this used?" `(ux.md §1.9)` | Event Searcher by name, switch, variable. | **gap** | From any named thing, flag or routine: list setters and readers. Pure model query over the project. | P2 |
| Live debug panel `(mz.md §13, mz.md Top 15 #3)` | Flip switches and variables during test play. | **gap** | Game-state drawer in Test run: flags and counters, edit live, "why is this state active". Playtest-only, off the wire. | P2 |

### 2.2 Dialogue and text

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Message window `(mz.md §7)` | Bottom/middle/top box, portrait, speaker name box, typewriter, blocking. | **partial** — `show-text` → `SHOW_TEXT_REQUESTED` → GTK toast (`engine-event-bridge.ts:92`). | `core` runtime gains `DialogueSystem` drawing an Excalibur screen-space box (same reason as `HudSystem`: a Full Run window and a browser export must show it). Speaker, portrait, position, typewriter speed. | P1 |
| Choices with cancel branch `(mz.md §7, 2k3.md §4.2)` | Up to six options, per-option branches. | **gap** — no choice action. | `ask` block with 2–4 options, each a block list; "cancel does…" optional. Needs UI focus via `InputSourceComponent` (touch, keys). | P1 |
| Text markup `(mz.md §7)` | Inline codes for name, variable, colour, icon, pause. | **gap** | Small token set only: `{player}`, `{flagName}`, `{color:…}`, `{icon:…}`, `{pause}`. Validated at author time; unknown tokens warn. | P2 |
| Signs and readable things `(oot2d-comparison.md §4.1)` | Press at a sign to read; original signs were not readable. | **partial** — `sign` template, toast only. | Works as soon as the text box lands. New behaviour, not fidelity. | P1 |
| Stored NPC speech `(tuxemon.md §4)` | NPC lines live on the NPC row; dialogue keyed by id. | **partial** — `dialogue` holds a bare `dialogueId` no system resolves. | One path: `dialogue` stores lines inline (`LocalizedText`) and is read by the box; `show-text` stays for scripted lines. Retire the dangling id. | P1 |
| Speech bubbles `(mz.md §4, tuxemon.md §2.2)` | Emote balloons over a character. | **gap** | `bubble` block: a handful of named icons (!, ?, heart, idea). Cheap charm. | P2 |
| Number input `(mz.md §7)` | Digit entry into a variable. | **gap** | `ask-number` for code locks; P3 puzzle. | P3 |
| Scrolling text `(mz.md §7)` | Credits-style scroll. | **gap** | Shared with the credits scene (§2.14). | P3 |
| Name entry `(2k3.md §4.2)` | On-screen keyboard renames an actor. | **gap** | `ask-name` for the hero, once the text box exists. | P3 |

### 2.3 World and map

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Tile layers and depth `(2k3.md §2, mz.md §2)` | Two layers (2003) or four plus shadow and region. | **have** — `LayerData.plane ground\|hero\|overlay`, order within a plane (`inv.md §2`). | Keep planes. Our named planes are the answer to "hidden layer rules" (`ux.md §4.2`). | — |
| Autotiles `(mz.md §2, 2k3.md §2)` | Paint a material, edges appear. | **have** — `TerrainData`, presets, `terrain-paint.service.ts`. | Keep. More packs are content work. | — |
| Per-tile passability `(mz.md §2, 2k3.md §2)` | Per-direction block bits per tile type, set once in the tileset. | **partial** — `TileProperties.walkable` boolean. | Keep the boolean for kids. One-way tiles (ledges, fences) as an optional per-direction field later. | P3 |
| Draws above characters `(mz.md §2)` | A star flag on tiles. | **have** via `overlay` plane. | Keep. Consider a tile-level shortcut only if the plane workflow annoys authors. | — |
| Tile behaviours: bush, damage floor, ladder, counter `(mz.md §2)` | Special tile flags. | **gap** | `hurts` (with `combat-action`, P2); counter = "talk across it" (with shops, P3); bush and ladder P3. Terrain tag is skipped. | P2 |
| Surface and footsteps `(2k3.md §1)` | Terrain row drives footsteps, damage, encounter rate. | **partial** — `surface`, `footstepSound` data; `WALKED_ONTO_TILE` has no audio listener. | Audio system reads it (§2.11). | P2 |
| Zones (regions) `(mz.md §2, ux.md §1.2, 2k3.md §2)` | Invisible painted ids for encounters, restrictions, queries; RM2003 has rectangular areas on the map tree. | **gap** — `region-geometry.ts` is preview only; `regionKinds` deferred (`inv.md §2`). | Named, coloured **Zones** painted on the map. Command `zone.paint` (map data, needs a scene). First two readers: music zone, enemy/encounter zone. | P2 |
| Map properties `(mz.md §2, ux.md §1.5)` | Editor name vs display name, music, encounters, scroll, parallax. | **gap** — no music, encounter or on-enter fields (`TODO.md:34`). | `MapData.displayName`, `music`, `onEnter` (block list). Edited through the existing map-settings path. | P1 |
| Map tree and world atlas `(mz.md §2, 2k3.md §2)` | Nested map folders; inherited per-area settings. | **have** — `mapCategories`, atlas positions. | Keep. Optional inheritance of music from a parent category. | P3 |
| In-game world map `(inv.md §2)` | Not a maker staple. | **gap** | Reuse the atlas as a player-facing map; later. | P3 |
| Scroll loop and parallax `(mz.md §2, 2k3.md §2)` | Wrap-around maps, background layer. | **gap** | `backgroundColor` exists. Parallax and wrap are P3 polish. | P3 |
| Doors and map transfers `(ux.md §1.8)` | Transfer event with a target tile and facing. | **have** — `teleport` + `trigger`, "Goes to…" picker. | Keep. Doors need `visual` (Kokiri fix 4). | — |
| Elevation and floors `(inv.md §2)` | Not a maker staple. | **partial** — `elevation` typed, no runtime (`TODO.md:50`). | Only when stairs or multi-storey interiors are asked for. | P3 |
| Swim and water `(oot2d-comparison.md §4.1)` | Water polygons swap the hero into a swim state. | **gap** | Tile `surface: water` plus a movement profile; shared with a later boat. | P3 |
| Vehicles `(mz.md §6, 2k3.md §1)` | Boat, ship, airship; reach comes from tile terrain data. | **gap** | Boat first, as a `vehicle` component reading tile surface. Optional system. | P3 |
| Day/night and weather `(mz.md §10)` | Screen tint, rain, snow. | **gap** | See §2.11. | P3 |

### 2.4 Movement

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Hero movement and facing probe `(oot2d-comparison.md §3.4)` | Step on a grid; interact with what you face. | **have** — `PlayerSystem`; `action-button` fires on the tile in the facing direction. | Keep the probe shape: you must face the target. | — |
| Solid things `(inv.md §8)` | Same-as-hero priority blocks the hero. | **partial** — `CollisionComponent` built and read by nothing (`TODO.md:59`). | A reader so chests, signs, NPCs and statues block. Prerequisite for good-looking templates. | P1 |
| NPC idle behaviour `(mz.md §3, tuxemon.md §4)` | Fixed, random, approach, custom route; Tuxemon `wander`/`patrol`. | **partial** — `npc-route` read by `HostileAiSystem` only. | `NpcMovementSystem` and a behaviour picker: *Stands still · Wanders · Walks a route · Follows you*. | P1 |
| Movement route as blocks `(mz.md §6, 2k3.md §3)` | Step, turn, wait, jump, speed, switch. | **gap** | `walk` block (direction × steps, then "wait until done"), `face`; used by NPCs and cutscenes. Preview of the route on the map (`ux.md §2.4`). | P2 |
| Speed `(mz.md §3, 2k3.md §3)` | Six speed steps. | **partial** — `tilesPerSec` number. | Presets *slow · normal · fast* over `tilesPerSec`. Keep the number in Full view. | P3 |
| Tap-to-move pathfinding `(mz.md §6, 2k3.md §7)` | Tap a spot, hero walks. | **gap** | `PathfinderSystem` writing `InputSourceComponent` intent; accessibility and phones. | P2 |
| Dash `(mz.md §6)` | Hold to run; per-map disable. | **gap** | Option plus `MapData.noDash`; P3. | P3 |
| Jumping and ledges `(oot2d-comparison.md §3.3, mz.md §6)` | MZ jumps are route commands; original OoT2D has none. | **gap** | New design, not fidelity. Only a ledge tile plus a jump block when a game needs it. | P3 |
| Followers `(mz.md §6)` | Party trails the leader. | **gap** | Optional `party` system, cosmetic first. | P3 |

### 2.5 Characters and NPCs

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Character sheet convention `(mz.md §12, ux.md §4.2)` | 3×4 frames, multi-character sheets, filename prefixes change behaviour. | **have** — `SpriteSetData.kind: 'character'`, `characterAnimations` roles. | Keep explicit metadata. Never encode meaning in filenames (§5). | — |
| Cast library `(tuxemon.md §1)` | Slug-referenced NPC rows. | **have** — `entityLibrary`, Characters view, `playerActorId`. | Keep. | — |
| NPC template `(ux.md §1.8)` | Quick-create templates. | **have** — `npc` template. | Add behaviour picker (§2.4) and portrait. | P1 |
| Portrait `(mz.md §7, mz.md §12)` | Face sheet, 144-px cells. | **gap** | Optional `portrait` field on a character; shown by the text box. | P2 |
| Paper-doll character maker `(ux.md §1.12, mz.md §12)` | Layered parts, recolour, randomise; one recipe → sprite, face, battler. | **gap** | Editor tool producing a character sprite set via `__project/spriteset.add.*`. The no-art on-ramp. | P2 |
| Party and members `(mz.md §4)` | Join and leave, formation. | **gap** | Optional `party` system, with `combat-turn` or followers. | P3 |
| Per-actor class, nickname, profile `(mz.md §1)` | Actor/Class split with level curves. | **skip** | See §5: use entity templates plus presets. | — |

### 2.6 Items and economy

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Item definitions and bag `(mz.md §1, tuxemon.md §1)` | Item rows with category, price, effects; counted inventory. | **partial** — `item` component, `ItemPickupSystem`; no bag (`TODO.md:62`). | `item-def` library entities and `InventoryComponent` on the hero (owner `inventory`), `INVENTORY_CHANGED`. Reader: `has-item` condition and the bag screen. | P1 |
| Key items vs consumables `(mz.md §1)` | Item type flags. | **gap** | `kind: key \| use \| gear` on `item-def`; key items cannot be sold or dropped. | P2 |
| Using items `(mz.md §1, tuxemon.md §1)` | Effects list: heal, add state, run common event. | **gap** | Shared `effects` record (§3.3), run by the `use` action. | P2 |
| Equipment `(mz.md §1)` | Slots plus trait lists. | **partial** — `weapon` component only. | Slots `weapon · body · charm`; gear contributes modifiers (§3.3). | P2 |
| Gold and shops `(mz.md §4, tuxemon.md §1)` | Currency, shop list, resale multiplier. | **gap** | `economy` game system: `gold` counter, `shop` component (stock, price), `open-shop` block. | P2 |
| Treasure chest `(ux.md §1.8)` | Pays out once. | **have** — `chest` template; looks closed after opening (`TODO.md:61`). | Fixed by visual state overlays (§2.1). | P1 |
| Inn `(ux.md §1.8)` | Pay, restore party, fade in and out. | **gap** | Template `inn`: `ask`, take gold, `heal`, fade blocks. | P2 |
| Enemy drops `(mz.md §8)` | "One in N" drops. | **have** — `hostile.dropItemId`, drop chance. | Appearance via `item-def` visual (§2.7). | — |
| Crafting, bills, trading `(tuxemon.md §2.2, §7.3)` | Monster-game extras. | **skip** | Not in the core maker. | — |

### 2.7 Combat

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Real-time melee `(tuxemon.md §7.2)` | Overworld is the arena. | **have** — `combat-action`, five ECS systems (`inv.md §3`). | Primary combat mode. Keep. | — |
| Enemy behaviours `(mz.md §8, 2k3.md §5)` | Rated action lists with conditions. | **have** — `stationary \| patrol \| chase`. | Keep three. Conditional AI is skipped. | — |
| Real game over `(inv.md §8)` | Return to title or last save. | **partial** — hero is full-healed (`TODO.md:63`). | Event `HERO_DEFEATED` handled by the save system (§2.9). | P1 |
| Hurting floors, hazards `(mz.md §2)` | Damage-floor flag. | **gap** | Tile `hurts` read by `StatsSystem`. | P2 |
| Turn-based combat `(mz.md §8, 2k3.md §5, tuxemon.md §3)` | Queue, speed order, menus, state machine. | **gap** — `combat-turn` planned. | Second scene (`GameSystemSpec.scenes`). Reuses `stats`. Pick in §3.9. | P3 |
| Random encounters `(mz.md §8, tuxemon.md §4)` | Steps counter, weighted troop picked by zone. | **partial** — `TileProperties.encounterTable`, `WALKED_ONTO_TILE` unread. | Zone-scoped weighted table; only if turn-based or creature mode is on. In real-time games enemies are visible. | P3 |
| Skills and MP `(mz.md §1, tuxemon.md §1)` | Abilities with cost, scope, effects. | **gap** | Reuse `weapon` and effects; a four-slot "moves" list in `creatures`. | P3 |
| Elements and type chart `(mz.md §8, tuxemon.md §3)` | Multipliers per element pair. | **gap** | Named types and one small table, only in `creatures`. | P3 |
| Status effects `(mz.md §8, tuxemon.md §3)` | Duration, stacking, restrictions. | **gap** | Two states first (stun, poison), seconds-based; not step-based. | P3 |
| Free-text damage formula, crit, variance `(mz.md §8)` | Expression strings. | **skip** | Preset rule dropdown (§5). | — |
| Boss phases `(mz.md §8, 2k3.md §5)` | Battle events on HP or turn. | **gap** | Falls out of states: `when hp ≤ half` condition kind on the hostile. | P3 |
| Capture and monsters `(tuxemon.md §3, §7.1)` | Item effect `capture`, species, evolution. | **gap** | Optional `creatures` system on top of real-time combat (§3.9). Core stays creatureless. | P3 |
| Rewards `(mz.md §8)` | EXP, gold, drops. | **have** EXP and drops; gold **gap** | `gold` via `economy`. | P2 |

### 2.8 Progression and stats

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Base stats `(mz.md §8, 2k3.md §1)` | Eight params in MZ, six in RM2003. | **have** — `maxHp, hp, attack, defense`, level/exp (`stats` spec). | Keep four. `speed` arrives with `combat-turn` (its only reader). | — |
| Level and XP curve `(mz.md §1, 2k3.md §1)` | Per-class curves and four XP parameters. | **have** the fold (`EXPERIENCE_GAINED`, `LEVEL_UP`). | Presets *quick · normal · slow* in place of curve numbers. | P3 |
| Trait / modifier record `(mz.md §1, ux.md §1.10)` | `{code, dataId, value}` list on actors, gear, states; stacks across sources. | **gap** | Typed `modifiers` component (owner `stats`) plus `effects` for one-shots (§3.3). | P2 |
| Classes, learnings `(mz.md §1)` | Class templates, skills per level. | **skip** | See §5. | — |

### 2.9 Game UI (HUD, menus, title, window graphics, scaling)

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| HUD `(tuxemon.md §5)` | Composed widgets. | **partial** — `HudSystem` hearts only. | HUD slots (top-left health, top-right gold/keys, bottom prompt) filled by systems that opt in. Excalibur screen-space. | P2 |
| Window skin, 9-slice `(mz.md §9)` | One image carries frame, background, cursor, colour palette; tone adjustable. | **gap** | `ui.skin` project data: image, slice insets, tone, palette; default skin shipped. Edited via `__project/ui.set`. Used by box, menus, HUD (§3.4). | P1 |
| Screen size and integer scaling `(mz.md §9, 2k3.md §7)` | Fixed logical canvas, integer scale, letterbox; widescreen bolted on. | **partial** — `Engine.applyPlayZoom()` frames a roomful of tiles. | Fixed logical height in tiles, flexible width, integer scale where it fits (§3.4). | P1 |
| Safe area and anchors `(mz.md §9, 2k3.md §7)` | UI area smaller than screen. | **gap** | Anchored HUD and menus, so phone, tablet and desktop share one layout code path. | P1 |
| Touch controls `(mz.md §9, ux.md §4.3)` | On-screen buttons, tap-to-move. | **partial** — `TouchInputComponent`, quantised stick, one action button (`TODO.md:69`). | Add attack button when `combat-action` is on, pause button, tap-to-move (§2.4). | P2 |
| Pause menu `(mz.md §9)` | Item, skill, equip, status, save, quit scenes. | **gap** | One simple menu: *Bag · Team · Save · Settings · Quit*. Entries appear only if their system is on. | P1 |
| Title screen `(mz.md §9, 2k3.md §1)` | Background, title text, commands, music. | **gap** — `game-view.ts` is editor chrome. | `game-ui` system: title scene with New game / Continue / Settings; picture, title and music from project data. | P1 |
| Game-over screen `(mz.md §9)` | Dedicated scene. | **gap** | Part of `game-ui`; choices: *Try again · Load · Title*. | P1 |
| Options `(mz.md §10)` | Volumes, dash, touch UI; stored apart from saves. | **gap** | Music, effects, text speed, touch controls; per-device, not in the save. | P2 |
| Inventory, equipment screens `(mz.md §9, tuxemon.md §5)` | Standard scenes. | **gap** | Menu pages that need `inventory` and `stats`. | P2 |
| Map name popup `(mz.md §2)` | Shown on entry. | **gap** | Reads `MapData.displayName`. | P2 |
| Fonts `(mz.md §9)` | Main and number font files. | **skip** (for authors) | One good pixel font, replaceable per project. | P3 |
| Credits scene `(mz.md §7)` | Scrolling text. | **gap** | Generated from project credits plus asset licences (§2.14). | P3 |

### 2.10 Save

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Full snapshot `(2k3.md §6, mz.md §10)` | Every mutable thing, including edited tiles and running events. | **partial** — flags only, not persisted; `Engine.clearSaveState()`. | Saved record per `ComponentSpec.saved` flag (§3.5), keyed by stable ids. | P1 |
| Slots and summaries `(mz.md §10, 2k3.md §2)` | Numbered list with leader, time, map. | **gap** | Three named save cards with summary line (map name, time, hero) plus autosave. Not a numbered list (§5). | P1 |
| Autosave `(ux.md §3)` | MZ top slot after battles and transfers. | **gap** | On map change and on rest points. Needed on phones that suspend apps. | P1 |
| Save access toggle `(mz.md §4, 2k3.md §3)` | Disable saving in places. | **gap** | `MapData.canSave` and a `lock-saving` block. | P2 |
| Options kept apart `(mz.md §10)` | Separate config file. | **gap** | Device-level config. | P2 |
| Storage backends `(mz.md §10)` | File on desktop, browser storage on web. | **gap** | `SaveStore` interface: GJS file, browser IndexedDB. Host concern, not collab data. | P1 |

### 2.11 Audio and screen effects

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Audio channels `(mz.md §10, 2k3.md §4.6)` | Music, ambience, jingle, effect. | **partial** — `AudioReference` and `play-sfx` → toast. | `audio` system, labels *Music · Ambience · Jingle · Effect*; one `AudioSystem` honouring volume options. | P1 |
| Music per map and zone `(mz.md §2)` | Autoplay track on entry. | **gap** (`TODO.md:34`) | `MapData.music`, zone override. | P1 |
| Footsteps and surface sounds `(2k3.md §1)` | Terrain-driven. | **partial** — data, no listener. | Same `AudioSystem` listens to `WALKED_ONTO_TILE`. | P2 |
| Screen fades and flash `(mz.md §4, 2k3.md §4.7)` | Fade out/in, flash. | **gap** | `fade`, `flash` blocks; transitions on teleport. | P2 |
| Shake `(mz.md §4)` | Power, speed, duration. | **gap** | `shake` block, presets *small · big*. | P2 |
| Tint and weather `(mz.md §4, 2k3.md §4.7)` | Colour tone for day, night, cave; rain, snow. | **gap** | `mood` block with presets (*day · dusk · night · cave*) and `weather` (*rain · snow*). Optional system `atmosphere`. | P3 |
| Pictures `(mz.md §10, 2k3.md §4.7)` | 100 numbered image slots. | **skip** (slot model) | `show-image` with a name and anchor, auto-cleared on map change, if cutscenes ask for it. | P3 |
| Movie `(mz.md §4, 2k3.md §4.6)` | Fullscreen video. | **skip** | Not needed. | — |

### 2.12 Cutscenes

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Sequencer with blocking steps `(2k3.md §6)` | Interpreter stack with waits; player locked. | **gap** | `ActionRun` runtime component per running list; steps `block` or `fire-and-forget`; hero locked while a blocking run is active. | P1 |
| Lock and unlock controls `(tuxemon.md §2.2)` | `lock_controls` / `unlock_controls`. | **gap** | Implicit with the running list; explicit `lock-player` block for rare cases. | P2 |
| Camera moves `(mz.md §4, tuxemon.md §2.2)` | Scroll, pan, shake, set camera. | **gap** | `look-at` block (thing or tile), then `look-back`. | P2 |
| Cinema bars `(tuxemon.md §2.2)` | `start_cinema_mode`. | **gap** | Letterbox toggle in the running list. | P3 |
| Skip button | Not covered in reports. | **gap** | Skip returns to the end state; every block must be idempotent. | P2 |
| Autorun guard `(ux.md §2.6, mz.md §5)` | Autorun can freeze the game. | **skip** | Sequences are finite by construction; a runaway guard (max steps per frame) stays as a safety net. | — |

### 2.12b Extensibility

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Plugin manager `(mz.md §11, ux.md §1.13)` | Ordered JS files, typed params, generated UI. | **partial** — game systems are the unit; Game-rules page (`inv.md §7`). | Game systems stay the "plugin" and the switch UI stays the manager. | — |
| Typed commands from metadata `(mz.md §11)` | Plugins declare commands and params; the editor draws dialogs. | **gap** | `GameSystemSpec.actions`: declared block kinds with typed params, `kidLabel`, icon. The block editor renders pickers from them. | P2 |
| Typed system config `(mz.md §11)` | Parameter pickers. | **partial** — config bag plumbed, no descriptors. | `config` field descriptors, already planned. | P2 |
| Notes as metadata `(mz.md §11)` | Free-text tags per row. | **partial** — `custom-data` JSON bag. | Keep as an expert escape hatch only. | P3 |
| User-defined components, script tier `(inv.md §3)` | Plugins and JS. | **partial** — `script` marker with no runtime. | Deferred expert tier. Decide the fate of the `script` component (Q9). | P3 |
| Content packs `(tuxemon.md §6)` | Mod folder: data, maps, art, sounds, l18n. | **partial** — templates in `games/*`. | `starter` packs (planned): a system plus a ready map and cast. | P2 |
| Readable diffs `(mz.md §13)` | Pretty-print level for the JSON data. | **have** — JSON project files. | Keep stable key order for collab and Git. | — |

### 2.13 Localisation and credits

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Game text localisation `(mz.md §13, tuxemon.md §4)` | MZ has none beyond a Terms table; Tuxemon keys dialogue and ships l18n catalogues. | **gap** — maker UI is gettext; authored strings are plain JSON (`inv.md §7`). | `LocalizedText` for every authored string (§3.6). | P1 |
| Terms table `(mz.md §1)` | Every UI word editable. | **gap** | Menu and HUD words as a small `ui.terms` map with defaults. | P2 |
| Credits `(mz.md §13)` | Not a staple. | **gap** — `games/zelda-like/CREDITS.md` is licensing only. | Per-asset `credit` metadata on sprite sets and audio; credits scene generated. | P3 |
| Per-language fonts `(mz.md §9)` | Font per locale. | **skip** (now) | One bundled font covering the supported locales. | P3 |

### 2.14 Editor UX

| Concept | What RM / Tuxemon does | Our status | Proposal in our model | P |
|---|---|---|---|---|
| Single canvas, modes, side panel follows mode `(ux.md §1.1)` | One map view; palette changes with the mode. | **have** — tool rail, inspector, phone strips to four tools. | Keep. | — |
| Templates as front door `(ux.md §1.8, ux.md Top 10 #2)` | Door, treasure, inn, transfer. | **have** — `npc`, `item`, `teleport`, `event`, `chest`, `sign`, `door`, `trigger`, `spawn-point` (`entity-templates.ts`). | Add `inn`, `shop`, `lock`. Each makes a normal editable thing, never a black box. | P1 |
| Where-used search `(ux.md §1.9)` | Event Searcher. | **gap** | See §2.1. | P2 |
| One-tap test play `(ux.md §1.7)` | Toolbar button. | **partial** — `win.play` Test run; Live Run planned (`TODO.md:48`). | Keep. Add the debug drawer and "resume from here". | P2 |
| Deep undo `(ux.md §1.3, ux.md §4.3)` | 3 steps (2003), 20 (MZ). | **have** — `UndoStackComponent`. | History strip on top of it; depth is not capped in the engine. | P3 |
| Tutorial as a game `(ux.md §4.1)` | Playable tutorial project. | **partial** — `blank-starter` and `zelda-like` templates. | A short template that teaches by doing (talk → key → door → chest). | P2 |
| Resource import without slot geometry `(ux.md §4.2)` | Assign images to fixed sheet slots. | **gap** | Auto-slice any image, tag role (floor, wall, object). Compare Library › Graphics (`inv.md §7`). | P2 |
| Recent places `(ux.md §1.1)` | MZ Quick Access strip. | **gap** | "Recent places" list in the World view. | P3 |
| Touch-first authoring `(ux.md §4.3)` | Not supported by any version. | **partial** — phone view exists. | No right-click, hover or modifier requirements; long-press for pick. Inline editors, one level deep. | P2 |
| Collab and AI collaborator | Not in any maker. | **have** — WebRTC pair editing, in-process AI peer. | Our edge. Every proposal here stays collab-ready (see rules in §1). | — |

## 3. Cross-cutting design decisions

Each: options, recommendation, question for the owner (full list in §7).

### 3.1 Event model

Options for state: **(a)** RM pages, last matching wins; **(b)** our `states` (first match wins), shown as cards with sentences; **(c)** free if/else only.
**Recommendation: (b).** It already runs (`StateSystem`), reads top-to-bottom, and avoids the invisible page-order rule that `ux.md §2.6` lists as hard for beginners.

Triggers: four child-facing (*tapped, stepped on, left, by itself once*). `none` stays for routines. No autorun or parallel.

Conditions: replace `{flag, equals}` by a discriminated union; keep the old shape as sugar so existing data opens.

- `flag-is`, `counter` (six operators), `has-item`, `in-party`, `hp-at-most`, plus `all` / `any` / `not` with one level of nesting.
- No expression strings. `game-systems.md` already refuses an unvalidated DSL; an unknown `when` stays "warning, never matches".

Command list: nested block tree, stable textual `kind` ids. The curated set, about 28 blocks:

| Group | Blocks |
|---|---|
| Say | `say`, `bubble` |
| Ask | `ask`, `ask-number`, `ask-name` |
| Flow | `if`, `repeat`, `call-routine`, `stop` |
| Flags | `set-flag`, `change-counter` |
| Items | `give`, `take`, `use`, `open-shop` |
| Go | `teleport`, `walk`, `face`, `vanish`, `look-at` |
| Time | `wait` |
| Sound | `play-music`, `play-sfx` |
| Screen | `fade`, `flash`, `shake`, `mood`, `weather` |
| Life | `heal`, `hurt`, `fight`, `save`, `game-over` |

Systems add their own via `GameSystemSpec.actions` (§2.12b). Common to all: every block is idempotent when skipped and carries its `kidLabel`.

Quick templates stay the front door: door, chest, sign, inn, shop, lock-and-key, NPC with lines.

Authoring writes go through `__project/entity.upsert` (library things) and `object.place` (placement overrides); the runtime never mutates the tree.

*Open question: first-match (ours) or last-match (every maker)? See Q1.*

### 3.2 Named state: switches, variables, local flags

Options: **(a)** numeric cells like every maker; **(b)** named registry in project data; **(c)** implicit flags created by use, no registry.
**Recommendation: (b).** `flags: { id (slug), name, kind: yes-no | number | text, initial, scope: game | thing }`, created from the picker ("New flag…" inline). Stable slug ids are the key, display name is cosmetic, renaming is safe. A registry also makes *where-used* trivial and lets the debug drawer show every value. Rides `__project/flag.upsert` and `flag.remove`, idempotent and coarse.

`scope: thing` is the self-switch replacement: stored per placement id in the save state (stable-id rule), so "this chest is open" needs no global name. Templates create them.

Strings and counters are first-class from day one; the entire Maniac patch exists because RM2003 only had integers and switches (`2k3.md §7`).

*Open question: should `thing` flags be visible in the global flag list? See Q2.*

### 3.3 Traits and effects as the shared stat-modifier record

Options: **(a)** hard-coded fields per feature (today: `weapon.damage`, `hostile.contactDamage`, `stats.attack`); **(b)** one typed record each for passive modifiers and one-shot effects; **(c)** MZ's numeric `{code, dataId, value}`.

**Recommendation: (b), without numeric codes.**

- `Modifier { stat: 'attack' \| 'defense' \| 'maxHp' \| 'speed', op: 'add' \| 'mul', amount }`, in a `modifiers` list (owner `stats`).
- `Effect { kind: 'heal' \| 'hurt' \| 'give-state' \| 'run-routine' \| …, amount? }`, in `effects` on `item-def` and weapons (owner `inventory`).
- The picker is "add effect → pick kind → value", the MZ editor idea (`mz.md §1`), minus the 9-element taxonomy.

Gate: per the "field earns its place" rule in `game-systems.md`, it ships with its reader (equipment, `use`). Not before.

*Open question: do we want equipment at all in the first release (Q6)?*

### 3.4 Window graphics, fixed layout and integer scaling

Options for screen: **(a)** fixed logical resolution (4:3, as RM) with letterbox; **(b)** fixed logical *height* in tiles, flexible width, anchored UI; **(c)** free fractional scale.
**Recommendation: (b), integer scale whenever it fits, fractional only below a minimum phone size.** (a) wastes phone screens, and EasyRPG's widescreen hack shows that fixed positions turn wide modes into glitches (`2k3.md §7`). (c) blurs pixel art (`mz.md §9`).

- HUD and menus use anchors (corner, edge, centre) over a safe area; one layout code path for phone and desktop.
- Window look is one `ui.skin`: 9-slice frame, slice insets, tone, a small colour palette. Default skin is shipped; a project may swap the image. Drawn in Excalibur screen-space like `HudSystem` (§2.9).
- `Engine.applyPlayZoom()` already frames a roomful of tiles; it becomes the height-in-tiles rule.

*Open question: what logical height in tiles (e.g. 11 or 15)? See Q3.*

### 3.5 Save is a full snapshot

Options: **(a)** snapshot of flags only (today); **(b)** snapshot of authored-mutable state, resume at rest; **(c)** also save interpreter stacks and edited tiles, as RM2003 does (`2k3.md §6`).
**Recommendation: (b).**

- Every `ComponentSpec` states `saved: true \| false`. The snapshot is: flags and counters, per-placement local flags and states, hero position, facing, map, bag, gold, stats of saved entities, removed/defeated markers, play time.
- All keyed by stable ids (`PlacementIdComponent.id`, `LayerData.id`, entity ids). Never Excalibur ids.
- Resume at rest: saving is disabled during a blocking sequence; autosave runs on map change. That avoids serialising a half-run block list, at the cost of exact mid-event resume.
- A `schemaVersion` plus an explicit migration (pre-release format, but players keep saves once a game ships).
- Storage is a host `SaveStore`. Saves are playtest and play state, not a Command and not collab data.

*Open question: is "save only at rest" acceptable (Q5)?*

### 3.6 Localisation of game text

Options: **(a)** plain strings (today); **(b)** `LocalizedText = string | Record<locale, string>` inline; **(c)** string table with keys and per-locale catalogues (Tuxemon style, `tuxemon.md §4`).
**Recommendation: (b) now, (c) as an export.** Inline stays readable in the editor and merges in collab; a later "export to PO/XLIFF" tool can derive a catalogue. Switching from (a) to (b) is cheap while the format is pre-release and breaking changes are allowed (`AGENTS.md`). Every authored string uses it from the first dialogue block on.

*Open question: do we want per-locale text editing in the first dialogue UI (Q4)?*

### 3.7 Core vs optional game systems

Rule of thumb from `game-systems.md`: a base system must contribute at least one ECS system, and the base layer is pinned to `core`, `stats`, `inventory`.

| New capability | Home | Reason |
|---|---|---|
| Text box, choices, sequencer, flags registry, conditions | `core` runtime | Events are core. No new base system, so the pin is untouched. |
| Bag, key items, effects | `inventory` (base) | It already owns `item`. |
| Music, ambience, effects | new `audio` system, on in starter packs | Sound is a real switch: a game may be silent. |
| Title, pause menu, skin, options, saves | new `game-ui` system (needs `GameSystemSpec.scenes`) | Scenes are planned there. |
| Gold, shops, inn | `economy` (planned) | Needs `inventory`. |
| Tint, weather, cinema bars | `atmosphere` | Optional polish. |
| Quests, followers/party, vehicles | `quests`, `party`, `vehicles` | Optional. |
| Turn battles, creatures | `combat-turn`, `creatures` | Optional (§3.9). |

*Open question: does `game-ui` count as always on, or a switch? See Q8.*

### 3.8 Persistent identity everywhere

Every new runtime key, whether a flag, a saved record or a quest step, uses a stable id. This is how collab (WebRTC and the AI peer) and saves stay consistent; skip one rule and the feature works solo and desyncs with a second peer.

### 3.9 Real-time vs turn-based combat

Options: **(a)** turn-based only (MZ, RM2003, Tuxemon); **(b)** real-time only; **(c)** real-time first, turn-based as a second optional system.
**Recommendation: (c).** The Tuxemon report finds turn-based needs about 30 UI/state files for a few rules (`tuxemon.md §7.2`) and is a burden for child authors; the real-time core exists, and the owner's creature idea ("throw a capsule, steer the creature") reuses it.

- Keep the Tuxemon *data shape*: species, move, item, encounter table, type chart, capture chance. Add `timing`: cooldown seconds, wind-up, range, hitbox.
- Start with one creature per side, four abilities, stun and poison only, capture on weakened targets.
- Fallback if steering proves too entangled with the combat core: one ability per turn, not the full Tuxemon status stack.
- `creatures` is a switchable system; the maker must still ship creatureless games (`tuxemon.md §7.3`).
- Provide presets and a visible "why did that hit?" log, since real-time is harder to debug (`tuxemon.md §7.2`).

*Open question: is turn-based `combat-turn` still wanted, or does `creatures` replace it? See Q7.*

### 3.10 Y-sorting and depth

**Evidenced, independent of the original:** hero z is `zFor('hero') + 50`; placements sit at exactly `zFor(plane)` (`oot2d-comparison.md §2.4`). So the hero is always in front of every prop in the same plane, even one south of the hero. That is a real defect for trees, signs and NPCs.

**Unverified premise:** that the original game sorts by Y. Its renderer declares a Y axis but runs sort mode Default, so the axis may not apply (`oot2d-comparison.md §2.4` review). Check by running the original before basing a port on it.

Options: **(a)** Y-sort actors and placements within the hero plane; **(b)** an explicit "front strip" overlay for house walls; **(c)** per-thing priority *below · with hero · above* (RM2003 does this with Y sort for "same", `2k3.md §3`).
**Recommendation: (a) plus (c) as a per-thing override.** Tile art keeps using planes. Sorting key: `y` of the foot position; ties by placement id for stable, deterministic order. (b) stays available as an authoring choice for houses.

*Open question: verify against the original first, or ship (a) now (Q10)?*

## 4. Kokiri fixes

From `oot2d-comparison.md §5`, corrected and in order of player-visible impact per effort. Size: S data or one file, M a few systems plus tests, L new capability.

| # | Fix | Size | Note |
|---|---|---|---|
| 1 | ~~Props one row too high~~ — refuted. Tiled anchors tile objects at the bottom-left; `y/16 − 1` is correct. | — | Do not change the converter. Optionally pin it with a regression test. |
| 2 | One frame time for all four walk cycles (`walk-left` is 130 ms, the rest 200 ms). | S | `spritesets/link.json:194-206`. |
| 3 | Walk cycle about 10 frames at about 50 ms (now 4 at 200 ms). | S | Needs the original walk sheets. |
| 4 | Doorways get a `visual` component (the two door placements are invisible). | S | Needs doors with a door tile. |
| 5 | Water polygons: `trigger` plus swim movement profile. | M | Restores the one real original behaviour. See §2.3. |
| 6 | Signs: `dialogue` plus interaction trigger. | M | New behaviour, not fidelity. Depends on the text box (M1). |
| 7 | 275 cells lost to layer collapse: allow a second ground or decoration layer and re-import Map Layer 0 separately. | M | Schema forces one sprite per cell per layer. |
| 8 | Hero always in front of house walls. | L | See §3.10: premise unverified. Start with the Y-sort that is evidenced. |
| 9 | Jump and ledge behaviour. | L | Out of scope: neither the original nor the engine has it. |

Do not "fix" walk speed (both are 6 tiles/s, `oot2d-comparison.md §3.1`). Do not chase a flip/rotate bug (none exists, `§1.3`).

## 5. Deliberately skipped

| Skipped | Why | Replacement |
|---|---|---|
| Numeric ids as the user-facing key (switch 12, variable 8, enemy 003) `(mz.md Top 15, ux.md §4.2)` | A child cannot hold numbers in mind; deleting and re-adding breaks silent references (`ux.md §2.6`). | Named records with stable slug ids; renames safe. |
| Numeric command codes and structural jump markers `(2k3.md Top 10, skip #1)` | Every editor operation then keeps a `subcommand_path` consistent. | Nested block tree with textual `kind` ids. |
| Free-text damage formulas and numeric trait codes `(mz.md §8, Top 15)` | Expression strings need parsing and validation; numeric codes are unreadable. | Preset rules and the typed `Modifier`/`Effect` records (§3.3). |
| Autorun and parallel processes `(mz.md §5, ux.md §2.6)` | The two classic freeze and lag sources. | Bounded sequences; "always check" via state conditions. |
| Labels, goto, free loops `(mz.md §5)` | Low value for children, high confusion. | `if` and bounded `repeat`. |
| 100-slot picture model `(mz.md §10)` | Slot numbers again. | Named image blocks, auto-cleared. |
| Arbitrary JavaScript for kids `(mz.md §11, ux.md §4.3)` | Unsafe for shared projects, not the audience. | Typed blocks. A future expert tier is deferred. |
| Filename-prefix magic (`$`, `!`) `(mz.md §12)` | Hidden convention. | Explicit sprite-set metadata (already ours). |
| Numbered save-slot lists, fixed slot counts `(2k3.md Top 10, skip #2)` | Historical. | Three save cards plus autosave. |
| Integer-only state, A–E rank tables, the 300000-unit ATB gauge `(2k3.md Top 10, skip #3 and #4)` | Compression tricks. | Strings, counters, named elements, seconds-based timing. |
| Multiple engine variants and patch detection `(2k3.md Top 10, skip #5)` | Compatibility burden. | One versioned format and explicit migrations. |
| Class tables, class-based level curves, 12 weapon-type taxonomies `(mz.md §1)` | Wide data model for no kid value. | Entity templates and stat presets. |
| Conditional AI lists, crit/variance/evasion tables `(mz.md §8)` | Balance tooling for adults. | Three behaviours, one preset rule. |
| Terrain tags, notetags as primary metadata `(mz.md §2, §11)` | Programmer vocabulary. | Typed fields; `custom-data` only as an escape hatch. |
| Proprietary asset licensing, encryption `(mz.md §13)` | Against our open stance. | Per-asset credit metadata. |
| Tuxemon extras: bills, plagues, daycare, park, trading, phone, cipher, celestial cycles `(tuxemon.md §7.3)` | Drift into one specific game. | `creatures` carries only the minimum subset (§3.9). |
| Right-click eyedropper and hover-only editing `(ux.md §4.3)` | No such thing on touch. | Long-press pick. |

## 6. Proposed roadmap

Each milestone ships in the same commit as its reader. Collab-ready means: every mutation is a registered Command or a `__project/*` op, each new component has a `system:` owner, and the docs (`game-systems.md` reach table, `TODO.md`) change in the same commit. Playtest-only state (dialogue, sequencer, save slots) stays off the wire.

| # | Milestone | Goal | Game systems touched | Size | Depends on |
|---|---|---|---|---|---|
| M0 | Kokiri data fixes | Fixes 2, 3, 4 (plus a regression test for 1). | none (data) | S | — |
| M1 | Talk | Text box, choices, `LocalizedText`, sign and NPC lines work. Retires the toast for `show-text`. Kokiri fix 6. | `core` (`DialogueSystem`) | M | — |
| M2 | Remember | Named flags and counters registry, local per-thing flags, condition union, live debug drawer, where-used. | `core` | M | M1 |
| M3 | Living things | Visual and collision state overlays, collision reader, `NpcMovementSystem` and behaviour picker, per-thing priority. Chest and door look right. | `core`, `stats` untouched | M | M2 |
| M4 | Sound | `audio` system: music per map, effects, footsteps, volume. | new `audio` | M | — |
| M5 | Bag and gold | `InventoryComponent`, `item-def`, `has-item`, key items, `use` effects, `modifiers`, gold, shop and inn. | `inventory`, `stats`, `economy` | M–L | M2 |
| M6 | Blocks and cutscenes | Nested block editor, curated set, routines, sequencer with blocking steps, move-route blocks, camera look-at, skip. | `core` | L | M1, M2 |
| M7 | Look and layout | `ui.skin`, 9-slice windows, logical height with integer scale, anchors and safe area, HUD slots, touch attack and pause buttons. | `game-ui`, `core` | M | M1 |
| M8 | Save and menus | Snapshot (`saved` flag), `SaveStore` (file, IndexedDB), three cards plus autosave, title, pause menu, game over, options. Real game over from `combat-action`. | `game-ui`, `core`, `combat-action` | L | M2, M5, M7 |
| M9 | Zones and depth | Named zones (Command `zone.paint`), music zone, Y-sort for actors and placements, water and swim. Kokiri fixes 5, 7, 8. | `core`, `audio` | M–L | M4 |
| M10 | Editor on-ramp | Templates `inn`, `shop`, `lock`; tutorial game; character maker; resource auto-slice; recent places; history strip. | editor only | L | M3, M5 |
| M11 | Optional systems | `combat-turn`, `creatures`, `quests`, `party`/followers, `vehicles`, `atmosphere`, tap-to-move, credits scene. Each its own plan. | each its own | L each | M5, M8 |
| M12 | Extensibility | `GameSystemSpec.actions` and `config` descriptors, `starter` packs, localisation export. | frame | M | M6 |

Reading order: M0 and M4 run in parallel with the rest; M1 → M2 → M3 is the first playable story loop ("talk to the guard, get the key, open the door, chest stays open"); M5 and M6 are the long poles; M8 finishes the product loop.

## 7. Open questions for the owner

1. **State order.** Our `states` pick the first matching one; every maker picks the last. Keep first-match (§3.1)?
2. **Thing flags in the global list.** Should per-thing flags ("this chest is open") appear in the global flag registry and where-used, or only on the thing?
3. **Screen height.** Which logical height in tiles for the phone and desktop target (§3.4), and is fractional scale allowed below a minimum size?
4. **Per-locale text in the first dialogue UI.** Ship `LocalizedText` with a language switch in M1, or store only the project language and add locales later (§3.6)?
5. **Save timing.** Is "save only at rest, no mid-event resume" acceptable (§3.5)?
6. **Equipment.** Is gear with slots part of the first release, or only weapons plus key items for now (§3.3)?
7. **Turn-based.** Is `combat-turn` still wanted next to real-time, or does the real-time `creatures` system replace it (§3.9)?
8. **Game UI as a switch.** Is `game-ui` always on in exported games, or an off-able system (§3.7)?
9. **The `script` component.** It has no runtime and no reader. Remove it now, or keep it for the deferred expert tier (§2.12b)?
10. **Depth.** Verify the original's sorting by running it, or ship Y-sort for actors and placements now because the defect is real regardless (§3.10)?
