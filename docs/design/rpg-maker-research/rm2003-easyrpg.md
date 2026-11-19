# RPG Maker 2003 concepts, as seen through EasyRPG

> Working document — extended section by section. Sources are shallow, read-only clones:
> `liblcf` (the LDB/LMU/LMT/LSD data-format library and its CSV schema definitions) and
> `easyrpg-player` (the runtime). We study the **concepts** of the RM2k3 data model and
> runtime to inform PixelRPG Maker. No code is copied: EasyRPG is GPL. Claims cite the
> source file; interpretation is marked *(inferred)*.

Source roots (abbreviated in citations below):

- **LCF** = `easyrpg-liblcf/` — generator schema in `generator/csv/*.csv`, reader/struct code in `src/`.
- **PLR** = `easyrpg-player/` — runtime in `src/`.

## Contents

1. [Database (LDB) entities and key fields](#1-database-ldb-entities-and-key-fields)
2. [Map (LMU) model](#2-map-lmu-model)
3. [Events](#3-events)
4. [Full event command list](#4-full-event-command-list)
5. [Battle system (RM2003 side-view ATB)](#5-battle-system-rm2003-side-view-atb)
6. [Player runtime architecture](#6-player-runtime-architecture)
7. [Beyond 2003: Maniac patch, extensions, multi-resolution](#7-beyond-2003-maniac-patch-extensions-multi-resolution)
8. [Top 10 concepts to take, and 5 to skip](#top-10-concepts-a-modern-child-friendly-maker-should-take-from-rm2003-and-5-to-deliberately-skip)

## 1. Database (LDB) entities and key fields

The LDB is a single database file deserialised into `lcf::Data::database`. Every entity is stored in an ID-addressed array; references between entities are *integer IDs*, not pointers (`Ref<Actor>`, `Ref<Skill>`, … in `LCF generator/csv/fields.csv`). `fields.csv` also records an
`Is2k3` bit, so the same schema describes both RM2k and RM2k3; fields flagged 1 exist only in
2k3. "A–E ranks" and "A–E rates" below are five-level numeric gradings, not named enums.

| Entity | Key fields (conceptual grouping) | Source |
|---|---|---|
| **Actor** | `name`, `title`, `character_name`/`character_index` (map sprite), `face_name`/`face_index`, `initial_level`/`final_level`, `exp_base`/`exp_inflation`/`exp_correction` (the level curve), `parameters` (base HP/SP/ATK/DEF/SPI/AGI per level), `initial_equipment`, `skills` (`Learning`: level → skill ID), `class_id`, `two_weapon`, `lock_equipment`, `auto_battle`, `super_guard`, `critical_hit`/`critical_hit_chance`, `state_ranks`, `attribute_ranks`, `battle_commands`, `battle_x`/`battle_y`, `unarmed_animation`, 2k3 `battler_animation`, `rename_skill`/`skill_name` | `LCF generator/csv/fields.csv`, `structs.csv` |
| **Class** | parallel to Actor, holds shared `parameters`, `skills`, `state_ranks`, `attribute_ranks`, `battle_commands`; `System.equipment_setting` chooses class- vs actor-based equipment | `LCF fields.csv`, `enums.csv` |
| **Skill** | `type` (`normal`/`teleport`/`escape`/`switch`/`subskill`), `scope` (one enemy / all enemies / self / one ally / party), `sp_type` (flat cost or % of max SP), `sp_cost`, `power`, `hit`, `variance`, `physical_rate`/`magical_rate`, `affect_hp`/`sp`/`attack`/`defense`/`spirit`/`agility`, `absorb_damage`, `ignore_defense`, `state_effects` + `attribute_effects` (bit arrays), `animation_id`, `sound_effect`, `occasion_field`/`occasion_battle`, `using_message1`/`2`, `failure_message`, `switch_id`, 2k3 `battler_animation(_data)` | `LCF fields.csv`, `enums.csv` |
| **Item** | `type` (weapon, shield, armor, helmet, accessory, medicine, book, material, special, switch), `price`, `uses`, equipment bonuses (`atk_points1…agi_points1` and 2k3 `…2`), weapon flags (`two_handed`, `preemptive`, `dual_attack`, `attack_all`, `ignore_evasion`, `prevent_critical`, `raise_evasion`, `half_sp_cost`, `no_terrain_damage`, `cursed`), `recover_hp(_rate)`, `recover_sp(_rate)`, `occasion_field1`/`2`/`occasion_battle`, `skill_id`, `switch_id`, `actor_set`/`state_set`/`attribute_set` bit arrays, `state_chance`, 2k3 `class_set`, `ranged_trajectory`, `ranged_target` | `LCF fields.csv`, `enums.csv` |
| **Enemy** | `name`, `battler_name`/`battler_hue`, `max_hp`/`max_sp`/`attack`/`defense`/`spirit`/`agility`, `exp`, `gold`, `drop_id`/`drop_prob`, `miss`, `critical_hit(_chance)`, `levitate`, `transparent`, `state_ranks`, `attribute_ranks`, `actions` (`EnemyAction`: basic attack / skill / transformation, with `condition_type` of always / switch / turn / actor count / HP / SP / party level / party fatigue, a `rating` weight and optional switch side-effects) | `LCF fields.csv`, `enums.csv` |
| **Troop** | `name`, `members` (`enemy_id`, `x`, `y`, `invisible`), `auto_alignment`, `terrain_set`, `appear_randomly`, `pages` (`TroopPage` = condition + event commands) | `LCF fields.csv` |
| **Terrain** | `name`, `damage`, `encounter_rate`, `background_name`, `footstep` sound, `bush_depth` (none/third/half/full), boat/ship/airship pass flags, `airship_land`, `background_type` (`background` or `frame`) plus two scrollable parallax layers with independent H/V scroll flags and speeds, 2k3 `special_flags` with back/lateral offsets for party/enemies, `grid_location`/`grid_top_y`/`grid_elongation`/`grid_inclination` | `LCF fields.csv`, `enums.csv`, `flags.csv` |
| **Attribute** | `name`, `type` (`physical` or `magical`), five `a_rate…e_rate` coefficients. *(inferred)* These are the "A–E" elemental slots whose rates are modified by actor ranks, skill/attribute effects and state rates. | `LCF fields.csv`, `enums.csv` |
| **State** | `name`, `type` (`ends`/`persists`), `color`, `priority`, `restriction` (normal / do nothing / attack enemy / attack ally), `a_rate…e_rate` modifiers, `affect_type` (half/double/nothing), stat modifiers, `hold_turn`, `auto_release_prob`, `release_by_damage`, `avoid_attacks`, `reflect_magic`, `cursed`, skill/magic restrictions with level caps, HP/SP change types (lose/gain/nothing), per-actor/per-enemy messages, 2k3 `battler_animation_id` | `LCF fields.csv`, `enums.csv` |
| **Animation** | `name`, `animation_name` (graphic sheet), `large`, `scope` (`target`/`screen`), `position` (`up`/`middle`/`down`), `frames` (each `AnimationFrame` = cells with cell ID, x/y, zoom, tone, transparency) and `timings` (`frame`, SE, flash scope/color/power, screen shake) | `LCF fields.csv`, `enums.csv`, `structs.csv` |
| **Chipset** | `name`, `chipset_name` (tile sheet), `terrain_data` (terrain ID per lower tile), `passable_data_lower` (per-tile direction bits), `passable_data_upper`, `animation_type` (`reciprocating`/`cyclic`), `animation_speed` | `LCF fields.csv`, `enums.csv` |
| **BattleCommand / BattleCommands** | A battle command is just `name` + `type` (`attack`, `skill`, `subskill`, `defense`, `item`, `escape`, `special`). The global `BattleCommands` set holds `placement` (manual/automatic), `row` (front/back shown), `battle_type` (`traditional`/`alternative`/`gauge`), `window_size`, `transparency`, `commands`, a death handler (valid common event, teleport target and facing); the `easyrpg_*` defaults in this record are EasyRPG additions, not original 2k3 (§7) | `LCF fields.csv`, `enums.csv`, `fields_easyrpg.csv` |
| **CommonEvent** | `name`, `trigger` (`automatic`/`parallel`/`call`), `switch_flag` + `switch_id`, `event_commands` | `LCF fields.csv`, `enums.csv` |
| **System** | Graphic sets (title, gameover, system, system2, boat/ship/airship), `party` (initial actor IDs), `menu_commands`, all BGM/SFX assignments, fade-in/out transition enums (21 styles each), `message_stretch`, `font_id`, `save_count`, 2k3 `show_frame`/`frame_name`, `invert_animations`, `show_title`, `equipment_setting`, `battletest_*` data | `LCF fields.csv`, `enums.csv`, `constants.csv` |
| **Switch / Variable** | each carries only a `name`; the *values* live in the save file (`SaveSystem.switches`, `SaveSystem.variables`), not in the LDB | `LCF fields.csv`, `LCF fields_easyrpg.csv` |
| **Database (root)** | named collections: actors, skills, items, enemies, troops, terrains, attributes, states, animations, chipsets, common events, switches, variables, classes, battle commands, battler animations, system, terms | `LCF generator/csv/fields.csv`, `structs.csv` |

Conceptually the LDB is "static content, all small integer IDs, and a handful of bit arrays for 'which actors/states/attributes does this apply to'". Everything that changes during play is split out into the LSD save. *(inferred)*

## 2. Map (LMU) model

**Layers and tile IDs.** A map has `width`, `height`, `lower_layer` and `upper_layer` — two
`Vector<Int16>` grids of raw tile IDs. Events are a separate `Array<Event>` with `x`/`y`.
`LCF generator/csv/fields.csv` (structure `Map`).

Tile IDs are *ranges*, decoded in `PLR src/map_data.h` (`ChipIdToIndex`) and
`PLR src/game_map.cpp:1011`:

| Range | Meaning | Index stride |
|---|---|---|
| `0…1999` | Block A: 2 lower autotile-like sets (water/grass *inferred*), stride 1000 | 2 indices |
| `2000…2999` | Block B: one 1000-tile set ("buildings" is the usual convention, *inferred*), stride 1000 | 1 index |
| `3000…3049`, `3050…3099`, `3100…3149` | Block C: three 50-tile sets, stride 50 | 3 indices |
| `4000…4649` | Block D: 12 autotile sets × 50 variants, stride 50 | 12 indices |
| `5000…5143` | Block E: 144 individual lower tiles, stride 1 | 144 indices |
| `10000…10143` | Block F: 144 upper (wall/roof) tiles, stride 1 | 144 indices |

So a chipset exposes 162 *passability entries* for lower tiles and 144 for upper tiles;
`PLR src/game_map.cpp:1882-1891` loads `chipset->passable_data_lower/up` and pads them to those
sizes with `0x0F`.

**Passability per direction.** `PLR src/map_data.h:74` defines the bit flags:
`Down=0x01`, `Left=0x02`, `Right=0x04`, `Up=0x08`, `Above=0x10`, `Wall=0x20`, `Counter=0x40`.
`Passable::Above` is the "upper layer tile lets you stand here" bit; `Wall` marks upper-tile
wall edges; `Counter` marks counter tiles that block only from the far side (`PLR src/game_map.cpp:1145`). A move's direction is converted into a mask of one or two bits by `GetPassableMask` (`PLR src/game_map.cpp:710`), and a tile is walkable only if *both* the source tile and the destination tile allow that mask (`PLR src/game_map.cpp:829-830, 988-1008`). For autotiles, `IsPassableLowerTile` maps the raw variant ID back to the owning autotile entry, with special cases for staircase-like variants that are passable even though the base tile is walled (`PLR src/game_map.cpp:1019-1029`). Vehicle passability is a *separate* per-terrain flag set (`boat_pass`, `ship_pass`, `airship_pass`, `airship_land`), not a tile bit (`LCF fields.csv`, structure `Terrain`).

**Terrain IDs.** Each lower tile maps to a terrain via `Chipset.terrain_data`, indexed by the
decoded chip index — with an RPG_RT optimisation: empty `terrain_data` means "all terrain 1" (`PLR src/game_map.cpp:1148-1157`). `Game_Map::GetTerrainTag(x, y)` returns that ID; it drives step encounters, damage, footstep SE, bush depth and battle background (`PLR src/game_map.cpp:950, 1131, 1563, 1660`).

**Autotiles.** Block D exposes 12 sets × 50 variant slots (`PLR src/map_data.h:41-44`), and passability logic handles variant IDs up to 46 specially (`PLR src/game_map.cpp:1019-1029`) — consistent with 47 layout variants plus animation frames *(inferred)*. The eight neighbour bits `NEIGHBOR_NW`…`NEIGHBOR_SE` (`PLR src/map_data.h:66-72`) are how an autotile records its surroundings *(inferred)*. Chipset `animation_type` reciprocating/cyclic and `animation_speed` control the water/flower animation of those tiles (`LCF fields.csv`, `enums.csv`).

**Map tree (LMT).** `TreeMap` holds `maps` (`Array<MapInfo>`), `tree_order`, `active_node` and
`start`. A `MapInfo` has `name`, `parent_map`, `indentation`, `type`
(`root`/`map`/`area`), `area_rect` (`l`,`t`,`r`,`b`) — an area is a rectangular sub-region of its parent map — plus a start `Start` with party/boat/ship/airship map IDs and X/Y. Per-area settings: `encounters` (array of troop IDs) and `encounter_steps` (steps per encounter), plus tri-state inheritance `teleport`, `escape`, `save` (`parent`/`allow`/`forbid`) and BGM/background selection (`parent`/`terrain` or `event`/`specific`) (`LCF fields.csv`, `enums.csv`, `structs.csv`; `PLR src/game_map.cpp:1687`).

**Panorama / parallax.** `Map` has `parallax_flag`, `parallax_name`, `parallax_loop_x/y` and
`parallax_auto_loop_x/y` with `parallax_sx/sy` speeds. Runtime keeps a `SavePanorama` with
current offsets and auto-scroll state, wraps scrolling modulo `parallax_width * TILE_SIZE * 2`, and deliberately differs from RPG_RT in one wrap case (`PLR src/game_map.cpp:2100-2217`). Terrains can additionally define two scrolling background layers (`LCF fields.csv`, structure `Terrain`).

**Confirming the constants.** Native logical resolution **320×240**
(`SCREEN_TARGET_WIDTH`/`HEIGHT` in `PLR src/options.h:36,39`), logical tile size **16 px** (`TILE_SIZE` in `PLR src/options.h:50`), internal character coordinates in 1/16th tile units (`SCREEN_TILE_SIZE = 256` in `PLR src/game_map.h:48`; see also
`LCF constants.csv`: `kPanXDefault = 9*256`, "Equal to 9 tiles in 1/16th pixels"), and
**15 save slots** by default (`PLR src/game_constants.h:106`: "Save slots displayed in the
Save/Load scenes; default: 15"; files are `Save01.lsd`… in `PLR src/scene_save.cpp:68-69`). RM2k3 caps at level 99 / 9,999,999 EXP / 9,999 damage, vs 50 / 999,999 / 999 in 2k (`PLR src/game_constants.h:90-96`).

## 3. Events

**Structure.** A map `Event` is `name`, `x`, `y` and an ordered `pages` array (`LCF fields.csv`; `PLR src/game_event.cpp`). `Game_Event::RefreshPage` scans pages in reverse and picks the first matching one — i.e. the *last page whose condition is true* wins (`PLR src/game_event.cpp:152-161`). With no matching page the event is paused and passes through everything (`PLR src/game_event.cpp:162-168`).

**Page fields** (`LCF fields.csv`, structure `EventPage`): `condition`, `character_name`,
`character_index`, `character_direction` (up/right/down/left), `character_pattern`
(left/middle/right/middle2), `translucent`, `move_type`, `move_frequency`, `move_speed`,
`trigger`, `layer`, `overlap_forbidden`, `animation_type`, `move_route`, `event_commands`.

**Conditions** (`EventPageCondition`): a flag bitfield saying which of switch A, switch B,
variable, item, actor, timer, timer2 are tested; then `switch_a_id`, `switch_b_id`,
`variable_id`, `variable_value`, `compare_operator` (`equal`/`greater_equal`/`less_equal`/
`greater`/`less`/`not_equal`), `item_id`, `actor_id`, `timer_sec`, `timer2_sec`
(`LCF fields.csv`, `flags.csv`, `enums.csv`). `timer2` is a 2k3-only condition flag.

**Triggers** (`EventPage.Trigger`): `action` (press decision key / talk), `touched` (walk onto
it), `collision` (bump into it), `auto_start` (runs on map load), `parallel` (runs concurrently every frame). Common events have only `automatic`, `parallel`, `call` (`CommonEvent.Trigger`) — note the renamed vocabulary: map "auto_start" ≈ common "automatic", and a common event is invoked from an event command rather than placed on a tile (`LCF enums.csv`; `PLR src/game_commonevent.cpp`).

**Priority layers** (`EventPage.Layers`): `below` (drawn under the player), `same` (sorted with
the player by Y), `above` (drawn over the player). `PLR src/game_character.cpp` implements the Y-sorting (`GetLayer`/`IsAboveCharacters` style logic).

**Movement types** (`EventPage.MoveType`): `stationary`, `random`, `vertical`, `horizontal`,
`toward`, `away`, `custom` (a `MoveRoute`). `MoveSpeed` is a 6-step enum
`1/8, 1/4, 1/2, normal, double, fourfold`; `move_frequency` is a numeric delay between
automatic move commands (`LCF enums.csv`, `fields.csv`).

**Animation types** (`EventPage.AnimType`, 7 values): `non_continuous`, `continuous`,
`fixed_non_continuous`, `fixed_continuous`, `fixed_graphic`, `spin`, `step_frame_fix`
(`LCF enums.csv`; `PLR src/game_character.cpp` switches on `animation_type`). This is the "character pattern advances when moving / always / never" family of options.

**Move-route commands.** A `MoveRoute` is `move_commands` (array of `MoveCommand` =
`command_id` + string/numeric params), `repeat`, `skippable`
(`LCF fields.csv`). The 42 `MoveCommand.Code` values (`LCF enums.csv`) group as:

- **Step moves** (0–7): up/right/down/left, the four diagonals.
- **Targeting moves** (8–11): random, towards hero, away from hero, forward.
- **Facing** (12–15 + 19–22): face up/right/down/left, turn 90° right/left, 180°, random 90°, random direction, face hero, face away from hero.
- **Flow** (23–27, 36–41): wait, begin/end jump, lock/unlock facing, walk everywhere on/off, stop/start animation, increase/decrease transparency.
- **Speed** (28–31): increase/decrease movement speed and movement frequency.
- **Side effects** (32–35): switch ON, switch OFF, change graphic, play sound effect.

**Battle-event conditions are a separate, richer condition record.** `TroopPageCondition`
has the same switch/variable core plus `turn_a`/`turn_b` (turn range), `fatigue_min/max`,
`enemy_id` + `enemy_hp_min/max`, `actor_id` + `actor_hp_min/max`, and 2k3-only
`turn_enemy_*`, `turn_actor_*`, `command_actor_id`/`command_id`
(`LCF fields.csv`, `flags.csv`; see §5).

## 4. Full event command list

Source: `LCF generator/csv/enums.csv`, structure `EventCommand`, entry `Code` (generated as
`LCF src/generated/lcf/rpg/eventcommand.h`). Every code below is listed **once**, with a
short description of what it does. Numbering families: `10xxx` = ordinary map/battle commands,
`13xxx` = battle-only commands, `20xxx`/`22xxx`/`23xxx` = structural "subcommand" markers that
RPG_RT embeds in the flattened command stream, `1005…1009`/`5001…5005` = patch-era extensions recognized by the format. *(inferred for the family semantics; the codes themselves are cited.)*

### 4.1 End, flow control and structure

- `END` (10) — end of a command list / terminator.
- `EndEventProcessing` (12310) — stop this event's execution now.
- `EraseEvent` (12320) — remove this event from the current map for the session.
- `CallEvent` (12330) — call another map event and return afterwards.
- `Label` (12110) — named jump target.
- `JumpToLabel` (12120) — unconditional jump to a label.
- `Loop` (12210) — start a loop block.
- `BreakLoop` (12220) — leave the innermost loop.
- `EndLoop` (22210) — structural marker closing a loop; skipped to when breaking (`PLR src/game_interpreter.cpp:3909-3963`).
- `ConditionalBranch` (12010) — typed condition block (switch, variable, item, actor, timer, …).
- `ElseBranch` (22010) — marker for the else arm of a branch (`PLR src/game_interpreter.cpp:3641`).
- `EndBranch` (22011) — marker for the end of a branch (`PLR src/game_interpreter.cpp:3845-3849`).
- `ConditionalBranch_B` (13310) — battle-side condition block (`PLR src/game_interpreter_battle.cpp:628`).
- `ElseBranch_B` (23310) — battle else marker (`PLR src/game_interpreter_battle.cpp:248, 635`).
- `EndBranch_B` (23311) — battle branch-end marker (`PLR src/game_interpreter_battle.cpp:251, 639`).
- `Comment` (12410) — editor note (`PLR src/game_interpreter.cpp:677`).
- `Comment_2` (22410) — continuation-line variant of a comment (`PLR src/game_interpreter.cpp:2136`).

### 4.2 Dialogue and player input

- `ShowMessage` (10110) — show a message window; can chain continuation lines.
- `ShowMessage_2` (20110) — continuation line consumed by the previous message (`PLR src/game_interpreter.cpp:942-946`).
- `MessageOptions` (10120) — window position, transparency, "continue events" flag.
- `ChangeFaceGraphic` (10130) — set the face shown in the message window.
- `ShowChoice` (10140) — show a multiple-choice prompt.
- `ShowChoiceOption` (20140) — structural marker for one choice option (`PLR src/game_interpreter.cpp:628-629, 901`).
- `ShowChoiceEnd` (20141) — structural marker ending a choice (`PLR src/game_interpreter.cpp:630-631, 906`).
- `InputNumber` (10150) — numeric input into a variable.
- `EnterHeroName` (10740) — name-entry screen for an actor.
- `KeyInputProc` (11610) — wait for / branch on a button press.
- `CallCommonEvent` (1005) — run a common event by ID (patch-era code).

### 4.3 Switches, variables and timers

- `ControlSwitches` (10210) — set/unset/toggle one or a range of switches.
- `ControlVars` (10220) — set/add/sub/mul/div/mod variables from constants or game data.
- `TimerOperation` (10230) — start/stop the primary or secondary timer.
- `StoreTerrainID` (10910) — write a tile's terrain ID into a variable.
- `StoreEventID` (10920) — write an event ID into a variable.

### 4.4 Party, actors and progression

- `ChangeGold` (10310) — add/remove currency.
- `ChangeItems` (10320) — add/remove items.
- `ChangePartyMembers` (10330) — join/leave an actor.
- `ChangeExp` (10410) — grant EXP to an actor.
- `ChangeLevel` (10420) — change an actor's level directly.
- `ChangeParameters` (10430) — raise/lower a stat.
- `ChangeSkills` (10440) — learn/forget a skill.
- `ChangeEquipment` (10450) — equip/unequip an item.
- `ChangeHP` (10460) — heal/damage HP.
- `ChangeSP` (10470) — heal/damage SP.
- `ChangeCondition` (10480) — add/remove a state.
- `FullHeal` (10490) — restore the whole party.
- `SimulatedAttack` (10500) — apply an attack calculation to an actor (damage test).
- `ChangeClass` (1008) — change an actor's class (patch-era code).
- `ChangeBattleCommands` (1009) — change an actor's usable battle commands (patch-era code).

### 4.5 Actor identity, system graphics, visibility

- `ChangeHeroName` (10610) — rename an actor.
- `ChangeHeroTitle` (10620) — change an actor's title.
- `ChangeSpriteAssociation` (10630) — change an actor's map character graphic.
- `ChangeActorFace` (10640) — change an actor's face graphic.
- `ChangeVehicleGraphic` (10650) — change a vehicle's graphic.
- `ChangeSystemBGM` (10660) — change a system music assignment.
- `ChangeSystemSFX` (10670) — change a system sound assignment.
- `ChangeSystemGraphics` (10680) — change a system graphic set.
- `ChangeScreenTransitions` (10690) — change fade/transition styles.
- `PlayerVisibility` (11310) — show/hide the player sprite.
- `FlashSprite` (11320) — flash a character sprite.

### 4.6 Audio, video and timing

- `Wait` (11410) — wait a number of frames or tenths of a second.
- `PlayBGM` (11510) — start music.
- `FadeOutBGM` (11520) — fade out music.
- `MemorizeBGM` (11530) — remember the current BGM.
- `PlayMemorizedBGM` (11540) — restore the remembered BGM.
- `PlaySound` (11550) — play one SE.
- `PlayMovie` (11560) — play a video file.

### 4.7 Screen effects and pictures

- `EraseScreen` (11010) — fade/transition out.
- `ShowScreen` (11020) — fade/transition in.
- `TintScreen` (11030) — colour tint over time.
- `FlashScreen` (11040) — full-screen flash.
- `ShakeScreen` (11050) — screen shake.
- `PanScreen` (11060) — camera pan.
- `WeatherEffects` (11070) — rain/snow/storm with strength.
- `ShowPicture` (11110) — display a 2D picture overlay.
- `MovePicture` (11120) — animate a picture's position/zoom/tone.
- `ErasePicture` (11130) — remove a picture.
- `ShowBattleAnimation` (11210) — play an animation on the map.

### 4.8 Map, movement and vehicles

- `Teleport` (10810) — move the party to a map/X/Y with a facing.
- `MemorizeLocation` (10820) — store a location.
- `RecallToLocation` (10830) — return to a stored location.
- `EnterExitVehicle` (10840) — board or leave boat/ship/airship.
- `SetVehicleLocation` (10850) — reposition a vehicle.
- `ChangeEventLocation` (10860) — move one event.
- `TradeEventLocations` (10870) — swap two events' positions.
- `MoveEvent` (11330) — assign and start a move route on an event.
- `ProceedWithMovement` (11340) — resume move routes.
- `HaltAllMovement` (11350) — stop all current move routes.
- `ChangeMapTileset` (11710) — swap the current chipset at runtime.
- `ChangePBG` (11720) — change the map's parallax/battle background graphic.
- `ChangeEncounterSteps` (11740) — adjust the step counter until the next encounter.
- `TileSubstitution` (11750) — replace one tile ID with another (patch-era code).
- `TeleportTargets` (11810) — configure allowed teleport destinations.
- `ChangeTeleportAccess` (11820) — enable/disable teleporting.
- `EscapeTarget` (11830) — configure the escape destination.
- `ChangeEscapeAccess` (11840) — enable/disable escaping.
- `EnemyEncounter` (10710) — force a battle against a troop.

### 4.9 Menus and game lifecycle

- `OpenShop` (10720) — open a shop with an item list.
- `Transaction` (20720) — shop outcome marker: a transaction happened (`PLR src/game_interpreter_map.cpp:206, 444`).
- `NoTransaction` (20721) — shop outcome marker: no transaction (`PLR src/game_interpreter_map.cpp:208, 448`).
- `EndShop` (20722) — shop block-end marker (`PLR src/game_interpreter_map.cpp:209`).
- `ShowInn` (10730) — inn prompt with a price.
- `Stay` (20730) — inn outcome marker: the party stayed (`PLR src/game_interpreter_map.cpp:214, 547`).
- `NoStay` (20731) — inn outcome marker: the party declined (`PLR src/game_interpreter_map.cpp:215`).
- `EndInn` (20732) — inn block-end marker (`PLR src/game_interpreter_map.cpp:217`).
- `OpenSaveMenu` (11910) — open the save menu.
- `ChangeSaveAccess` (11930) — enable/disable saving.
- `OpenMainMenu` (11950) — open the main menu.
- `ChangeMainMenuAccess` (11960) — enable/disable the main menu.
- `OpenLoadMenu` (5001) — open the load menu directly (patch-era code).
- `GameOver` (12420) — show the game-over screen.
- `ReturntoTitleScreen` (12510) — leave the game for the title screen.
- `ExitGame` (5002) — quit the application (patch-era code).
- `ToggleFullscreen` (5004) — switch fullscreen mode (patch-era code).
- `OpenVideoOptions` (5005) — open video settings (patch-era code).
- `ToggleAtbMode` (5003) — switch ATB wait mode (`PLR src/game_interpreter_map.cpp:874-879`).

### 4.10 Battle-only commands

- `ChangeMonsterHP` (13110) — alter an enemy's HP.
- `ChangeMonsterMP` (13120) — alter an enemy's SP.
- `ChangeMonsterCondition` (13130) — add/remove an enemy state.
- `ShowHiddenMonster` (13150) — reveal a hidden enemy.
- `ChangeBattleBG` (13210) — switch the battle background.
- `ShowBattleAnimation_B` (13260) — play an animation on a battler.
- `TerminateBattle` (13410) — end the current battle early.
- `VictoryHandler` (20710) — battle-result marker: victory (`PLR src/game_interpreter_map.cpp:196, 374`).
- `EscapeHandler` (20711) — battle-result marker: escape (`PLR src/game_interpreter_map.cpp:197`).
- `DefeatHandler` (20712) — battle-result marker: defeat (`PLR src/game_interpreter_map.cpp:198`).
- `EndBattle` (20713) — battle block-end marker (`PLR src/game_interpreter_map.cpp:199`).
- `ForceFlee` (1006) — force an escape (patch-era code).
- `EnableCombo` (1007) — enable double attacks (patch-era code).

### 4.11 What the shape of the list tells us

The command set is a *flat, imperative bytecode* with an indentation integer per command (`EventCommand.indent` in `LCF src/generated/lcf/rpg/eventcommand.h`); blocks are not nested objects but a start command plus structural markers at the same or lower indent. The interpreter's `SkipToNextConditional` walks by indent to find the matching `Else`/`End` (`PLR src/game_interpreter.cpp:588-605`). *(inferred)* This is a deliberately simple format a child-friendly editor can hide behind a block-shaped UI while still exporting/importing a flat script.

## 5. Battle system (RM2003 side-view ATB)

**Setup.** `Game_Battle::Init(troop_id)` looks up the `Troop`, marks battle as running, resets
turn counters, resets the enemy party and all actors, creates a `Game_Interpreter_Battle` over
`troop->pages`, builds a `Spriteset_Battle(background_name, terrain_id)` and resets equipment
states (`PLR src/game_battle.cpp:60-78`). The background comes from the current terrain (`Terrain.background_name`, or its `frame` variant) unless changed by a battle command.

**Formation and encounter conditions.** `System.battle_formation` is `terrain`/`loose`/`tight`
and `System.battle_condition` is `none`/`initiative`/`back`/`surround`/`pincers` (`LCF enums.csv`). Those values feed the placement tables in `PLR src/game_battle.cpp:379-556` and determine preemption/ambush: the ATB gauges are seeded differently for "initiative" (player first) vs "back"/"surround"/"pincers" (enemy advantage) (`PLR src/scene_battle_rpg2k3.cpp:175-204`). *(inferred)*

**ATB gauges.** Each `Game_Battler` keeps an integer gauge, clamped to
`GetMaxAtbGauge() = 300000` (`PLR src/game_battler.h:1080-1098`). `Game_Battle::UpdateAtbGauges`
sums the agility of all non-hidden battlers (×100) and gives each eligible battler an increment
`max_atb / (sum_agi / (agi + 1))`; dead/restricted battlers still contribute to the sum, hidden
enemies are excluded, and the 2k3 engine variant applies an accelerating multiplier as the gauge fills (`PLR src/game_battle.cpp:192-235`). There is no "all wait" mode baked into the gauge itself: `SaveSystem.AtbMode` is `atb_active` or `atb_wait` (`LCF src/generated/lcf/rpg/savesystem.h:57-64`), toggled by the `ToggleAtbMode` command; when waiting, the scene only advances gauges under specific conditions (`PLR src/scene_battle_rpg2k3.cpp:808-821, 895-901`). A ready actor is enqueued in `atb_order` so input is resolved in readiness order (`PLR src/scene_battle_rpg2k3.cpp:769-799`).

**Three battle UI layouts.** `BattleCommands.battle_type` is `traditional` (side-view status
window at the right, classic command list), `alternative` (different window placement) or
`gauge` (per-actor gauges beside the command window); `window_size` and `transparency` tune the
status window. The scene switches layouts in `PLR src/scene_battle_rpg2k3.cpp:608-620, 667-675`. RM2k had no ATB: it uses the separate `Scene_Battle_Rpg2k` (`PLR src/scene_battle_rpg2k.cpp`).

**Battle commands and rows.** An actor's usable commands come from `Actor.battle_commands`
(or the class when `System.equipment_setting == class`) and are drawn from the seven built-in command types `attack`, `skill`, `subskill`, `defense`, `item`, `escape`, `special` (`LCF enums.csv`; `PLR src/game_actor.cpp:870-930`). RM2k3 adds front/back rows:
`SaveActor.row` and the `RowShown` setting; the engine forces back-row actors forward if the
front row is all incapacitated, and lets a player switch rows under conditions (`PLR src/scene_battle_rpg2k3.cpp:142-156, 2826-2841`; `PLR src/game_actor.cpp:1145-1151`). The `Row` battle command itself is an EasyRPG "feature gate" re-enabling a patch-era command (`PLR src/scene_battle_rpg2k3.cpp:626-627, 1453`, `easyrpg_enable_battle_row_command` in
`LCF fields_easyrpg.csv`).

**Side-view animation data.** `BattlerAnimation` defines `speed` (slow/medium/fast) and an
array of `poses` — `Idle`, `AttackRight`, `AttackLeft`, `Skill`, `Dead`, `Damage`, `Dazed`,
`Defend`, `WalkLeft`, `WalkRight`, `Victory`, `Item` — each pose pointing at a character sprite
or a battle animation graphic; `weapons` name weapon sprite sets (`LCF fields.csv`, `enums.csv`; `PLR src/scene_battle_rpg2k3.cpp` drives these in its
`BattleActionState_*` machine, `PLR src/scene_battle_rpg2k3.h:62-81`). Items and skills can
override this with `BattlerAnimationItemSkill`: weapon vs battle animation, movement (none/step/jump/move), afterimage, number of attacks, ranged weapon sprite/speed (`LCF fields.csv`, `enums.csv`). A separate `Animation` asset is a sheet of frames/cells with timed SE, flashes and shakes (`LCF fields.csv`; `PLR src/battle_animation.cpp`).

**Battle events.** `Troop.pages` are `TroopPage { condition, event_commands }`. The battle
interpreter schedules a page when its condition matches the current hook and marks it
`executed`, so each page normally fires once
(`PLR src/game_interpreter_battle.cpp:190-220`; `PLR src/game_battle.cpp:73`). Conditions can test switch A/B, variables, turn ranges, party fatigue, an enemy's HP range, an actor's HP range, and 2k3-specific "enemy turn", "actor turn" and "actor issued command" (`LCF fields.csv`, `flags.csv`). The RM2k3 action state machine threads event hooks around the action itself: `BattleActionState_PreEvents`, `Conditions`, `Notify`, `Combo`, `StartAlgo`,
`Animation`, `Execute`, `SwitchEvents`, `Apply`, `PostAction`, `PostEvents`, `Finished`
(`PLR src/scene_battle_rpg2k3.h:62-81`).

**Enemy AI.** Each `EnemyAction` chooses `basic` (attack, dual attack, defense, observe,
charge, autodestruction, escape, nothing), a skill, or a transformation; a `condition_type` always/switch/turn/actors/HP/SP/party level/party fatigue gates it and `rating` weights the random pick (`LCF enums.csv`, `fields.csv`; `PLR src/enemyai.cpp`, `game_enemy.cpp`).

**Damage resolution.** `Game_BattleAlgorithm` subclasses implement the different action kinds
and call into `Algo::CalcNormalAttackEffect` / `CalcSkillEffect`, applying the A–E attribute rates, state rates, variance, critical hits, guard, row position and battle condition (`PLR src/game_battlealgorithm.cpp:716, 1003`; `PLR src/algo.cpp`). Messages are assembled from localisable `Terms` strings (`LCF fields.csv`, structure `Terms`).

*(inferred)* For a child-friendly maker the reusable idea is "battle is a state machine plus a
condition-driven event interpreter", not the specific 300000-unit gauge or the A–E rate tables.

## 6. Player runtime architecture

**Scenes.** The runtime is a stack of `Scene` objects; `Scene::Push`/`Pop`/`PopUntil` manage it
and `SetRequestedScene` defers a transition until a safe point (`PLR src/scene.h:156-183, 237, 353`). Concrete scenes live one per file in
`PLR src/scene_*.cpp`: logo, title, map, menu, item, skill, equip, status, order, shop, name,
save, load, teleport, battle (two variants: `Scene_Battle_Rpg2k` and
`Scene_Battle_Rpg2k3` over a shared `Scene_Battle`), gameover, end, debug, file/browser,
settings, language, import. `Scene_Map` splits a frame into `PreUpdate`, `UpdateStage1`,
`UpdateStage2` and `UpdateSceneCalling`, and uses `AsyncNext`/`OnAsyncSuspend` to suspend
across teleports and other multi-frame operations (`PLR src/scene_map.cpp:90-150, 231-378`). The timing base is a fixed game FPS via
`Game_Clock::GetTargetGameTimeStep` with a capped simulation catch-up per frame
(`PLR src/game_clock.h:35-80`).

**Windows.** Each scene composes `Window_*` objects, all derived from a drawable window base
(`PLR src/window_base.cpp`, `window_selectable.cpp`); examples are `Window_Message`,
`Window_Command`, `Window_SaveFile`, `Window_ShopBuy`, `Window_BattleStatus`,
`Window_BattleMessage`, `Window_Interpreter`, `Window_VarList`
(`PLR src/window_*.cpp`, 48 .cpp files). Windows own their own scroll/cursor state and paint into the logical 320×240 framebuffer. *(inferred)*

**The interpreter loop.** `Game_Interpreter` is a virtual machine over a *stack of execution
frames*. Each `SaveEventExecFrame` holds a copied command vector, a `current_command` index, event ID, a "triggered by decision key" flag and a `subcommand_path` describing nested branches (`LCF fields.csv`, structure `SaveEventExecFrame`; `PLR src/game_interpreter.cpp:109-151`).
`Update()` (`PLR src/game_interpreter.cpp:381-556`) runs at most `loop_limit` commands per frame
(logging "exceeded execution limit" at 10000) and, per command:

1. resets async state; if an async op is pending (e.g. a teleport or a yield) it breaks out and
   resumes later (`PLR src/game_interpreter.cpp:421-434`);
2. breaks while a message is pending/active or the player is boarding/unboarding
   (`PLR src/game_interpreter.cpp:436-446`);
3. counts down `wait_time` (frames; `Wait` converts tenths-of-a-second via `DEFAULT_FPS`), waits
   for a decision key (`wait_key_enter`), waits until no movement is pending (`wait_movement`),
   or polls button input (`KeyInputProc`) before continuing
   (`PLR src/game_interpreter.cpp:313-325, 448-495`);
4. refreshes map events when a variable/switch changed (`Game_Map::GetNeedRefresh()`), pops
   completed frames, dispatches one command, and only increments the program counter if the
   command didn't change it itself (`PLR src/game_interpreter.cpp:496-546`).

`CallEvent` pushes a new frame; `EndEventProcessing` pops a called frame; parallel (non-main)
interpreters *never* clear their base frame — they reset `current_command` to 0 and wait for a frame, which is both an optimisation and RPG_RT-compatible behaviour (`PLR src/game_interpreter.cpp:843-880`). Parallel map events and common events each own an
`lcf::rpg::SaveEventExecState` in their save data
(`LCF fields.csv`: `SaveMapEvent.parallel_event_execstate`, `SaveCommonEvent.parallel_event_execstate`;
`PLR src/game_event.cpp:78-114`). "Wait for completion" of movement is implemented via
`Game_Map::IsAnyMovePending()` gating the `wait_movement` flag
(`PLR src/game_interpreter.cpp:464-468`); `ProceedWithMovement` / `HaltAllMovement` release or cancel move routes (`PLR src/game_interpreter.cpp:733-737`).

**What a save contains.** The LSD is `lcf::rpg::Save` with these top-level records
(`LCF src/generated/lcf/rpg/save.h:40-56`; `LCF fields.csv`):

| Record | Contents |
|---|---|
| `title` | timestamp, lead hero name/level/HP, four face graphics — the load-menu summary |
| `system` | current scene, frame count, switches + variables arrays, message window settings, all current BGM/SE, fades, map/menu/save/teleport/escape permissions, save slot, ATB mode |
| `screen` | in-progress tint/flash/shake/pan values and timers, weather, running battle animation |
| `pictures` | every displayed picture with position, zoom, tone, flip, erase-on-map-change/battle-end flags |
| `party_location` / `boat_location` / `ship_location` / `airship_location` | party X/Y, facing, vehicle boarding state, camera pan target/speed, encounter step counter, save-count stamps |
| `actors` | per-actor current level/EXP, HP/SP and stat mods, learned skills, equipment, states, battle commands, row, flags |
| `inventory` | party IDs, item IDs/counts/usage, gold, two timers (frames, active, visible, battle flag), battles/defeats/escapes/victories/turns/steps counters |
| `targets` | memorised/recallable teleport destinations with an optional switch gate |
| `map_info` | current position, encounter steps, chipset ID, per-event save records, **modified lower/upper tile arrays**, parallax state |
| `panorama` | current panorama offsets |
| `foreground_event_execstate` + `common_events[*]` | complete interpreter stacks of all running events, including their wait flags and key-input state |
| `easyrpg_data` | EasyRPG-only extensions (version, codepage, windows) |

The key architectural fact: static content (LDB/LMU/LMT) is immutable, while *every* mutable bit — including script counters, interpreter call stacks and even edited tile layers — is serialised into the save (`LCF fields.csv`, structures `Save*`). *(inferred)* That is why a save can resume a half-executed event exactly mid-command.

## 7. Beyond 2003: Maniac patch, extended commands, multi-resolution

EasyRPG is not only a compatible interpreter: it is a compatibility layer plus a set of documented extensions, all gated so old games keep their old behaviour.

**Patch detection and engine variants.** The player identifies 2k vs 2k3, legacy/updated
versions, English ("E") releases and unofficial patches from the game's `RPG_RT.exe` version info, `--patch-*` flags and files such as `accord.dll` (`PLR src/player.cpp:816-856, 870-871`; `PLR src/player.h:38, 201-225, 454-513`;
`PLR src/game_config_game.cpp:93-120, 186, 227`). CLI switches include `--patch-maniac`,
`--patch-dynrpg`, `--patch-rpg2k3-commands` and `--engine`
(`PLR src/player.cpp:1525`). Runtime flags can even switch the battle system or patch behaviour per event (`LCF generator/csv/flags_easyrpg.csv`, `EasyRpgStateRuntime_*`;
`PLR src/feature.cpp`).

**Maniac Patch support.** BingShan's unofficial Maniac Patch for RM2k3 added 32 event
commands (`Maniac_GetSaveInfo` … `Maniac_Zoom`, codes 3001–3032 in
`LCF generator/csv/enums_easyrpg.csv`) and extra data fields: string variables
(`ldb/StringVariable` in `LCF generator/csv/structs_easyrpg.csv`), `SaveSystem.maniac_strings`, message-window width/height/font/hooks, global saves, mouse position, picture arrays and picture editing (`LCF fields_easyrpg.csv`). The interpreter implements these behind
`Player::IsPatchManiac()` (`PLR src/game_interpreter.cpp:792-828`, `ManiacBattleHook` in
`PLR src/game_battle.cpp:238-247`), plus patches such as Ineluki scripts-as-SE
(`PLR src/game_ineluki.cpp`) and DynRPG plugins (`PLR src/game_dynrpg.cpp`). *(inferred)* This is a whole alternative scripting layer — strings, arrays, mouse, save-file introspection, runtime picture manipulation — built *on top of* a command bytecode that originally had none of those concepts.

**EasyRPG's own commands.** Ten more codes, 2002–2058 in
`LCF generator/csv/enums_easyrpg.csv`: `EasyRpg_TriggerEventAt`, `Pathfinder`,
`CallMovementAction`, `WaitForSingleMovement`, `AnimateVariable`, `SetInterpreterFlag`,
`ProcessJson`, `CloneMapEvent`, `DestroyMapEvent`, `StringPictureMenu`. Data-side additions
include `easyrpg_*` actor options (custom AI, unarmed hit/state/attribute, critical/evasion control), battle defaults (`easyrpg_default_atb_mode`, `enable_battle_row_command`,
`sequential_order`, fixed facing), picture flip/blend/type and user-drawn windows with styled
text (`LCF fields_easyrpg.csv`, `flags_easyrpg.csv`, `structs_easyrpg.csv`). Runtime state is preserved in `SaveEasyRpgData` and per-event `easyrpg_runtime_flags` (`PLR src/game_interpreter.cpp:830-836, 875`).

**Multi-resolution and display.** The native logical frame is 320×240, but `game_resolution`
offers `original` 320×240 (4:3), `widescreen` 416×240 (16:9) and `ultrawide` 560×240 (21:9), explicitly flagged as experimental ("Can cause glitches") (`PLR src/game_config.h:134-137`; `PLR src/player.cpp:1555-1560`). Scaling modes nearest / integer / bilinear, `--stretch`, vsync, FPS limits, fullscreen and pause-on-focus-lost are host-side options (`PLR src/game_config.h:130`, `player.cpp:1548-1576`; `PLR src/baseui.cpp`). The renderer separates logical resolution from window size, yet UI windows still position relative to `MENU_WIDTH`/`screen_width` offsets (`PLR src/player.cpp:103-105, 934-938`) — so wider modes are a stretch, not a full responsive redesign. *(inferred)*

**What the original lacked (as revealed by the extensions):**

- **No string variables or arrays.** Everything is an integer variable or switch; even names
  are only edited through dedicated actor commands. Maniac string variables fill the gap.
- **No mouse, no gamepad abstraction exposed to events, no global cross-save data.**
- **No pathfinding and no "wait for this one movement" primitive** — move routes are scripted
  step by step and `wait_movement` waits for *all* movement.
- **No dynamic event instantiation** — events are authored on the map; cloning/destroying at
  runtime is an EasyRPG addition.
- **No structured data interchange** — hence the `ProcessJson` command.
- **No runtime tuning of engine behaviour**: battle type, ATB mode, row rules, autobattle AI,
  unarmed attack parameters and facing are static LDB choices; patches make them per-event.
- **No scalable canvas or responsive UI**: a fixed 320×240 logical screen and a fixed 15 save
  slots; multi-resolution is bolted on by the emulator, not by the game format.
- **No text/font/font-size control in the data model** beyond two system fonts and a
  stretch/tiled flag — Maniac/EasyRPG add full text rendering options.
- **No modern save features**: no cloud/multiple named files per player beyond numbered slots,
  no save metadata beyond the four-face title card.

*(inferred)* The pattern is consistent: every extension exists because RM2k3's data model was
designed for a single fixed-resolution, integer-only, single-player console-like experience. A modern maker should keep the *simple authoring model* but design in strings, collections, input abstraction and resolution independence from the start.

## Top 10 concepts a modern child-friendly maker should take from RM2003, and 5 to deliberately skip

### Take these ten

1. **One contiguous command list with an indent level, interpreted by a small VM.** It makes
   "scripting" a linear, undo-friendly list a child can rearrange, while branches/loops are
   just markers the runtime skips by indent (§4, §6). Keep the model; hide the markers behind
   real nested blocks in the editor.
2. **Events as "pages" of conditions over a tiny rule language** (switch A/B, variable compare,
   item, actor, timer) with a clear priority order (§3). This is a genuinely learnable
   if-this-then-that system for children, and it needs no text parsing.
3. **Triggers as a small closed set** — action, touch, collision, auto-start, parallel (§3).
   Five verbs cover most game logic; common events add "call" as a reusable subroutine.
4. **A data-driven database of ID-referenced entities** with a small fixed field set per type
   (§1). Actors/skills/items/enemies/states/attributes are editable tables, not code. The
   `Ref<Type>` discipline is what makes copy/paste and validation possible.
5. **Two tile layers plus a separate passability/terrain table per chipset** (§2). The split
   between "what is drawn" and "how it behaves" is the key lesson; direction bitmasks and
   per-tile terrain tags are a compact, inspectable ruleset.
6. **Autotiles as a small set of precomputed neighbour combinations** (§2). Children get
   seamless grass/water without understanding the bitmask; the editor can generate them.
7. **Map tree with areas and inherited settings** — parent map, `area_rect`, per-area
   encounter tables, and parent/allow/forbid flags for save/teleport/escape (§2). This gives
   "regions inside a map" without a second map editor.
8. **A visible, pausable time model**: frame-based waits, key waits, wait-for-movement,
   timers, parallel processes (§6). Explicit waiting is much easier to reason about than
   callbacks, and the runtime can serialise the whole wait state into the save.
9. **Battle as a state machine with condition-driven event pages** rather than a monolithic
   battle script (§5). The troop pages and pre/post-action hooks let a maker add "when the
   boss is below half HP, do X" as data.
10. **Save everything mutable, including interpreter stacks and edited tile layers** (§6). A
    save is a complete snapshot, not just a stats dump — a strong, simple contract.

*(inferred)* The general principle behind all ten: **small orthogonal data structures plus a
transparent interpreter beats a clever scripting language for a first-time creator.**

### Deliberately skip these five

1. **Flat numeric command codes and structural jump markers** (§4). Keep the VM concept, but
   give commands stable textual IDs and represent branches as real objects; otherwise every
   editor operation has to preserve `subcommand_path` bookkeeping.
2. **Fixed 320×240 / 16 px and 15 numbered save slots** (§2, §7). Use a resolution-independent
   logical canvas and player-named, unlimited saves. Widescreen as an afterthought produces
   the "experimental, can cause glitches" mode the emulator has today.
3. **Integer-only variables and switches as the sole state** (§7). Add strings, lists and
   dictionaries from day one — the entire Maniac Patch exists to compensate for their absence.
4. **A–E attribute/state rank tables and the 300000-unit ATB gauge** (§1, §5). These are
   historical compression tricks, not intuitive models. Use named stats/elements and a
   simple speed-to-turn or continuous gauge with a readable value range.
5. **Multiple incompatible engine variants and patch detection** (§7). Do not carry forward
   2k/2k3/legacy/updated/E/patch matrices, `accord.dll` heuristics and per-event patch flags.
   Ship one versioned format with explicit migrations; use feature flags only for *your own*
   deliberate extensions.

