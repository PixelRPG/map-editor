# Tuxemon — concept research for PixelRPG Maker

Scope: concepts only, in our own words; no code, text or assets copied. Tuxemon is GPL-3 (`LICENSE`),
art has separate licences (`ATTRIBUTIONS.md`). Source: a local read-only clone of the public Tuxemon repository.
**Citation convention:** paths are relative to that clone; anything not in a cited file is *(inferred)*.
In §2 names come from `name: ClassVar[str]` / `name = "..."` in `tuxemon/event/{conditions,actions}/<stem>.py`
(stem = name except `get_party_monsters.py` → `get_party_monster`; `common.py` is a base, not a type).
Orientation: Tuxemon is a **finished game with a maker inside it** — YAML tables → typed models, Tiled
rectangles → tiny scripts, queue-driven turn combat (`mods/db_config.yaml`, `tuxemon/map/loader.py`,
`tuxemon/combat/machine.py`). The transferable idea is the *shape* of those seams, not the monster IP.

---

## 1. Data-driven database

One YAML (or JSON) file per row in `mods/tuxemon/db/<table>/`; `mods/db_config.yaml` maps table names
to models, loaded/validated by `tuxemon/database/{config,loader}.py` with strict, range-checked models (`tuxemon/db.py`).

| Table | Key fields (with cited source) |
|---|---|
| Monster | `slug, species, txmn_id, height, weight, stage, terrains[], types[], shape, tags[], catch_rate, lower_catch_resistance, upper_catch_resistance, gender_weights{}, moveset[] {level_learned, technique, learning_method}, evolutions[] {at_level, monster_slug}, history[] {slug, stage, evolves_from, evolves_into}, flairs, sounds {combat_call, faint_call}, max_moves` — `tuxemon/db.py` (`MonsterModel`), example `mods/tuxemon/db/monster/agnidon.yaml`. Note: base stats are **not** in the row; they come from the species/shape/rules layer (`tuxemon/database/rules.py`, `tuxemon/db.py` `MonsterModel.get_combat_stats()`). |
| Technique | `slug, tech_id, sort, category, tags[], types[], power, accuracy, potency, speed, range, recharge, healing_power, target{enemy_monster, enemy_team, enemy_trainer, own_monster, own_team, own_trainer}, conditions[], effects[], modifiers[], stat_modifiers{}, visuals{}, sound{}, use_tech/use_success/use_failure` — `tuxemon/db.py` (`TechniqueModel`, `TargetModel`); example `mods/tuxemon/db/technique/fire_ball.yaml`. |
| Item | `slug, sprite, sort, category, cost, rarity, usable_in[] (states), conditions[], effects[], behaviors{throwing, resellable, …}, visuals{}, sound{}, reward_method, dynamic_menu` — `tuxemon/db.py` (`ItemModel`), `mods/tuxemon/db/item/tuxeball.yaml`, `mods/tuxemon/db/item/potion.yaml`. Capture is just an item effect: `conditions: wild_monster + base species/!threat`, `effects: capture` (`mods/tuxemon/db/item/tuxeball.yaml`). |
| Element / type | `slug, icon, types[{against, multiplier}]`; e.g. fire is 2× vs metal/venom/wood and 0.5× vs earth/fire/frost/water — `mods/tuxemon/db/element/fire.yaml`, model `tuxemon/db.py` (`ElementModel`, `ElementItemModel`). |
| NPC | `slug, template{sprite_name, combat_sheet, slug}, speech.profile{}, combat{}, audio{}, monsters[], items[], birthdate, persistence` — `tuxemon/db.py` (`NpcModel`), examples `mods/tuxemon/db/npc/nurse1.yaml`, `mods/tuxemon/db/npc/spyder_route1_npcs.yaml`. |
| Encounter | `slug, encounter_type: single|horde, monsters[] {monster, encounter_rate, held_items[], level_range, variables[], exp_req_mod, level_offset, min/max_player_level, scaling_enabled, override_level_range, scaling_offset_range}` or `horde.monsters[]` + `horde_level_range/horde_exp_mod`, plus zone scaling fields — `tuxemon/db.py` (`EncounterModel`, `HordeEncounterModel`), `mods/tuxemon/db/encounter/example_single.yaml`, `example_horde.yaml`. |
| Economy / shop | `slug, background, resale_multiplier, items[] {slug, price, cost, inventory}, monsters[] {slug, price, cost, inventory, level}, variables[]` — `mods/tuxemon/db/economy/tuxe_mart_taba.yaml`, `tuxemon/db.py` (`EconomyModel`…). |
| Quest / mission | `slug, description, prerequisites[], failure_conditions[], connected_missions[], required_items{}, required_monsters{}, required_missions[], repeatable, steps{} {slug, order, description, conditions, any_of, all_of, next_steps[], step_items_needed, step_monsters_needed, optional}` — `mods/tuxemon/db/mission/spyder.yaml`, `tuxemon/db.py` (`MissionModel`). |
| Status | `slug, category, icon, cond_id, effects[], conditions[], modifiers[], stat_modifiers{}, step_interval/type/value, duration, max_stacks, behaviors{persists_after_combat}, on_positive/negative_status, gain_cond` — `mods/tuxemon/db/status/burn.yaml`, `tuxemon/db.py` (`StatusModel`), runtime `tuxemon/status/status.py`. |
| Cross-cutting config | `mods/range_map.yaml` maps `melee/touch/ranged/reach/reliable` to user/target stats + weights; `mods/config_combat.yaml`, `mods/config_capture.yaml`, `mods/config_monster.yaml`, `mods/capture_devices.yaml`, `mods/ai_*.yaml`, `mods/healing_shop_config.yaml` tune rules without code. |

Takeaway: one row = one asset referenced by slug; rules/tuning live in shared config tables, not per row *(inferred)*.

---

## 2. Map + event model

Tiled `.tmx` maps (263 under `mods/tuxemon/maps/`) have object layers such as `Events`/`Collisions`.
An event is a rectangle of `type="event"` whose custom properties are line commands: `cond1`, `act1`,
`behav…` — e.g. `act1="random_encounter spyder_citypark,11"`, `cond1="is char_at player"`,
`cond2="is char_moved player"` (`mods/tuxemon/maps/classic_route_1.tmx`). `tuxemon/map/loader.py`
collects properties by prefix and converts pixels to a tile `BoundingBox`;
`tuxemon/event/eventparser.py` parses `"is/not <type> args"` into `SpatialCondition(type, parameters,
box, operator)` and `"<action> args"` into `ParameterizableRule` on `EventObject` (`tuxemon/db.py`,
`docs/handcrafted/scripting.rst`). `EventEngine` checks the group, runs actions over several frames and resets on map change
(`tuxemon/event/eventengine.py`). Types are one-class-per-file plugins
(`tuxemon/event/{eventcondition,eventaction,eventbehavior}.py`, `tuxemon/plugin.py`,
`docs/handcrafted/{action,condition,behavior}_list.rst`); extra behaviours: `door`, `talk` (`tuxemon/event/behaviors/`).

### 2.1 Condition types (complete, grouped)

Spatial/map + time:
- `char_at`
- `char_at_position`
- `char_in`
- `char_in_boundary`
- `camera_at`
- `location_inside`
- `location_name`
- `location_type`
- `environment_is`
- `time_is`
- `celestial_is`
- `to_use_tile`
- `tile_property_updated`

Characters:
- `char_exists`
- `char_defeated`
- `char_facing`
- `char_facing_char`
- `char_facing_tile`
- `char_gender`
- `char_healed`
- `char_moved`
- `char_sprite`
- `check_char_parameter`

Party / monsters / progression:
- `has_monster`
- `has_tech`
- `party_size`
- `party_status`
- `party_infected`
- `check_party_parameter`
- `check_max_tech`
- `check_evolution`
- `monster_flair`
- `tuxepedia`
- `has_tuxepedia`
- `kennel`
- `has_kennel`
- `bill_exists`
- `bill_is`
- `faction_reputation`

Inventory / economy:
- `has_bag`
- `has_item`
- `money_is`

Battle / story / variables / system:
- `battle_outcome`
- `battle_outcome_count`
- `check_mission`
- `check_teleport_faint`
- `current_state`
- `check_world`
- `afk_state`
- `cooldown_days`
- `timestamp_cooldown`
- `step_tracker`
- `tracker`
- `true`
- `one_of`
- `variable_is`
- `variable_set`
- `variable_highest`
- `variable_lowest`

Input / media:
- `button_pressed`
- `button_held`
- `button_count`
- `button_combo`
- `music_playing`

### 2.2 Action types (complete, grouped)

NPC / character control:
- `create_npc`
- `remove_npc`
- `char_face`
- `char_face_char`
- `char_look`
- `char_move`
- `char_walk`
- `char_run`
- `char_patrol`
- `char_wander`
- `char_position`
- `char_speed`
- `char_stop`
- `char_talk`
- `char_plague`
- `set_char_attribute`
- `modify_char_attribute`
- `set_char_birthday`
- `set_facing_mode`

Dialogue / choices / menus:
- `translated_dialog`
- `translated_dialog_choice`
- `cipher_dialog`
- `update_cipher`
- `set_bubble`
- `info`
- `print`
- `menu`
- `open_journal`
- `access_pc`
- `choice_item`
- `choice_monster`
- `choice_npc`
- `show_monster`
- `change_bg_char`
- `change_bg_monster`

Camera / scene / transitions:
- `camera_manage`
- `camera_mode`
- `camera_move`
- `camera_position`
- `camera_shake`
- `teleport`
- `teleport_faint`
- `transition_teleport`
- `transition_teleport_return`
- `screen_transition`
- `fade_in`
- `fade_out`
- `change_bg`
- `start_cinema_mode`
- `stop_cinema_mode`
- `set_layer`
- `set_appearance_layer`
- `update_tile_properties`
- `manage_map_cache`

Map geometry / environment / time:
- `add_collision`
- `remove_collision`
- `boundary_move`
- `boundary_resize`
- `boundary_set`
- `set_environment`
- `load_weather`
- `set_weather`
- `update_time`
- `pathfind`
- `pathfind_to_char`

Monsters / party / storage:
- `add_monster`
- `remove_monster`
- `random_monster`
- `store_monster`
- `withdraw_monster`
- `store_party`
- `replace_party_from_yaml`
- `clear_kennel`
- `create_kennel`
- `set_kennel_visible`
- `get_party_monsters`
- `get_party_monster`
- `get_pending_moves`
- `get_player_monster`
- `rename_monster`
- `set_monster_attribute`
- `set_monster_health`
- `modify_monster_health`
- `set_monster_level`
- `set_monster_status`
- `set_party_attribute`
- `set_party_status`
- `modify_monster_stats`
- `modify_monster_bond`
- `set_monster_bond`
- `set_monster_flair`
- `remove_flair`
- `set_monster_plague`
- `toggle_evolution_block`
- `evolution`
- `daycare`
- `park_experience`
- `dojo_method`
- `give_experience`

Techniques / items:
- `add_tech`
- `remove_tech`
- `overwrite_tech`
- `replace_techs_from_yaml`
- `learn_tech_by_method`
- `add_item`
- `add_held_item`
- `remove_held_item`
- `random_item`
- `trigger_status`

Economy / shops / quests / social:
- `set_money`
- `modify_money`
- `transfer_money`
- `open_shop`
- `set_economy`
- `set_price_policy`
- `set_routing_policy`
- `set_mission`
- `set_template`
- `change_taste`
- `set_tuxepedia`
- `clear_tuxepedia`
- `add_contacts`
- `remove_contacts`
- `modify_contacts`
- `change_faction_membership`
- `modify_faction_reputation`
- `set_bill`
- `modify_bill`
- `adjust_bill_penalty`
- `trading`
- `set_cipher`
- `crafting_station`
- `rename_player`

Battles / encounters:
- `random_battle`
- `random_encounter`
- `random_horde`
- `wild_encounter`
- `start_battle`
- `start_double_battle`
- `set_battle`
- `set_teleport_faint`

Flow / state / variables / persistence:
- `call_event`
- `change_state`
- `remove_state`
- `wait`
- `afk_threshold`
- `set_variable`
- `clear_variable`
- `copy_variable`
- `format_variable`
- `variable_math`
- `set_random_variable`
- `input_variable`
- `add_tracker`
- `remove_tracker`
- `add_step_tracker`
- `remove_step_tracker`
- `set_step_tracker_milestone_shown`
- `autosave`
- `save_game`
- `load_game`
- `save_timestamp`
- `load_yaml`
- `quarantine`
- `quit`
- `quit_world`
- `lock_controls`
- `unlock_controls`

Input recording / audio / effects / random:
- `input_load`
- `input_playback`
- `input_record`
- `input_save`
- `play_music`
- `pause_music`
- `unpause_music`
- `fadeout_music`
- `play_sound`
- `unload_sound`
- `play_map_animation`
- `play_tile_animation`
- `rumble`
- `rumble_pattern`
- `tune_radio`
- `add_combo`
- `remove_combo`
- `random_integer`

---

## 3. Combat

- **Phase machine:** `BEGIN → READY → HOUSEKEEPING → DECISION → PRE_ACTION → ACTION → POST_ACTION →
  RESOLVE_MATCH → …`; `CombatSession` holds two trainers, `FieldMonsters`, `ActionQueue`, damage and
  swap trackers (`tuxemon/combat/{machine,session,field_monsters}.py`).
- **Turn order:** `(category priority from config_combat.sort_order, effective speed, sub-priority tie-break)`;
  items/"meta" use speed 0, speed from `speed_monster()` (`tuxemon/combat/sort_manager.py`, `tuxemon/formula.py`).
- **Damage:** `(COEFF_DAMAGE + level) * stat * weight` × (type multiplier × power) ÷ floored target
  resistance, truncated to int; stat choice from `mods/range_map.yaml` (`tuxemon/formula.py` `simple_damage_calculate`).
- **Types:** technique types × target types multiply pairwise, clamped to `config_combat.multiplier_range`
  (`tuxemon/element.py` `calculate_affinity_score`, `tuxemon/formula.py`, `mods/tuxemon/db/element/fire.yaml`).
- **Accuracy / cooldown / targeting:** `accuracy`, `potency`, `range`, `recharge`, `initial_delay`,
  `min_recharge`, `starting_charge`, `cooldown_multiplier` + six `TargetModel` booleans (`tuxemon/db.py`).
- **Status effects:** data rows with `effects`/`conditions` plugins, duration, stacking and a step engine;
  burn deals flat damage every 10 steps (`mods/tuxemon/db/status/burn.yaml`, `tuxemon/status/{status,step_effect_engine}.py`).
- **Capture:** ball = item with effect `capture`; remaining HP × `catch_rate` × status × ball modifier ×
  random resistance band → `shake_check`, then `total_shakes` rolls; success clears `wild`, registers
  party + Tuxepedia (`tuxemon/formula.py`, `tuxemon/core/effects/capture.py`, `mods/tuxemon/db/item/tuxeball.yaml`).
- **AI:** wild picks random or scored actions; trainer AI also weighs healing items and opponent config
  (`tuxemon/ai/{ai,decision_strategy,technique_tracker}.py`, `mods/ai_{techniques,trainers,items}.yaml`).
- **XP / evolution:** pluggable splits (even, hit-proportional, item-holder feeder/transmitter); level-up
  refreshes stats, learns moves, flags an `evolutions[]` entry (`tuxemon/combat/experience_strategies.py`,
  `tuxemon/monster/monster.py` `set_level`).

---

## 4. Overworld

- **NPC movement:** entities have a tile path queue (`tuxemon/entity/npc.py`); scripts attach
  `char_wander` (frequency + optional rectangle), `char_patrol`, `char_walk`, `char_face`
  (`tuxemon/event/actions/char_wander.py`). Example: `create_npc 37707_male,33,8` + `char_wander
  37707_male,3` (`mods/tuxemon/maps/37707_town.tmx`).
- **Dialogue:** NPC lines live in `speech.profile` (`tuxemon/db.py` `NpcSpeech`), shown via
  `translated_dialog <key>` referencing `mods/tuxemon/db/dialogue/` and `mods/tuxemon/l18n/`.
- **Encounters:** "tall grass" = map rectangle with `random_encounter <zone>,<prob>` guarded by
  `char_at`/`char_moved` (`mods/tuxemon/maps/classic_route_1.tmx`); the action honours repellent,
  rolls species/level/held item and spawns a temporary trainer NPC (`tuxemon/event/actions/random_encounter.py`,
  `mods/tuxemon/db/encounter/`). `wild_encounter`, `random_horde`, `random_battle` are separate actions.
- **Items / healing / shops:** bag + held items on `NpcModel` (`tuxemon/db.py`); healing shops have
  per-HP cost, scaling mode and revive rules (`mods/healing_shop_config.yaml`, `tuxemon/states/shop_healing.py`);
  item/monster shops read an economy row (`tuxemon/states/{shop_item,shop_monster}.py`).

---

## 5. UI / HUD and menus

Screens are "states" under `tuxemon/states/`: world, dialogue, party, monster menu/moves/info, item,
technique, choice*, pc*/kennel/locker, shop* (item/monster/healing/training), journal, mission, daycare,
park, phone*, craft, save/load, evolution, level-up, combat state/menus, transitions. Combat HUD is composed
widgets (`tuxemon/ui/combat_{hud,bars,status,monsters,layout,zone}.py`); menus share a layout/cursor/theme framework (`tuxemon/menu/`).
Scaling is integer/global: `make_default_scaling` picks ×2 for `large_gui`, else `resolution[0] / native_resolution[0]`;
`ResolutionScaling` scales tuples by width/height ratios (`tuxemon/scaling.py`). *(Inferred: crisp pixels, fixed-native layout.)*

---

## 6. Mod system / content packaging

A mod is a directory under `mods/` with `mod.yaml` (slug, name, version, authors, start map/position,
starters, `startup_rules`) plus `db/`, `maps/`, `gfx/`, `sprites/`, `sounds/`, `music/`, `l18n/`,
`animations/` (`mods/tuxemon/mod.yaml`, `tuxemon/database/config.py` `ModMetadata`).
`mods/db_config.yaml` declares `active_mods`, `mod_activation`, `mod_tables`, `mod_table_exclusions`,
`mod_dependencies` (load order), `mod_db_subfolder: db`, `file_extensions: [.json, .yaml]`, model map;
bootstrap assembles translations, asset roots, loader and validator (`tuxemon/database/bootstrap.py`).
Placeholder `conditions/`, `effects/`, `states/` folders allow mod-local extensions
(`mods/tuxemon/{conditions,effects,states}/README.yaml`); core plugins come from `get_plugin_paths(...)`
(`tuxemon/event/{eventcondition,eventaction}.py`). *(Inferred: PixelRPG content pack = data + maps +
art, no Python in the common case.)*

---

## 7. Assessment for PixelRPG Maker

### 7.1 Clean minimum viable monster subset

*(All of this subsection is inferred from the sources above.)* Keep four tables: **species** (slug,
types, base stats, growth, moveset-by-level, evolution, catch rate), **move** (slug, type, power,
accuracy, target, effect tag), **item** (slug, category, effect tag, price), **encounter zone** (slug,
species weights, level range). Keep three systems: party/storage, damage/type chart, capture. Keep one
event set: `on enter tile`, `on interact`, `check variable`, `give/take item`, `start battle`, `heal`,
`talk`. Tuxemon's other 20+ tables (bills, factions, plagues, daycare, park, trading, phones, tasting,
celestial cycles, input recording) are optional DLC. Reuse PixelRPG's own data/event infrastructure
and vocabulary ("creatures", "abilities", "capsules") rather than importing Tuxemon's.

### 7.2 Turn-based vs. the owner's real-time idea

**Turn-based.** Pros: the loop is a queue plus a small effect DSL — decide, sort, apply, resolve —
which fits a data-driven maker and is deterministic/testable (`tuxemon/combat/machine.py`,
`tuxemon/formula.py`). Cons: needs move/target/switch menus and a status vocabulary; Tuxemon's own
battle UI spans ~30 state/UI files (`tuxemon/states/combat_*.py`, `tuxemon/ui/combat_*.py`), far more
than its rules — a burden for a child author.
**Real-time "throw a ball, steer the creature".** Pros: reuses the planned Zelda-like live combat
core (movement, hitboxes, cooldowns, HP, AI, animation), and "press for current attack" is easier
to grasp than a target menu; the overworld is the arena. Cons: accuracy, turn order, speed labels,
turn-based `recharge`, target booleans and step-based statuses do not transfer wholesale
(`tuxemon/combat/sort_manager.py`, `tuxemon/db.py`, `mods/tuxemon/db/status/burn.yaml`) — they need
seconds and hitbox/radius. Steering adds camera, collision, friendly-fire and body-control questions;
capture becomes a throw interaction (`tuxemon/core/effects/capture.py`); multiple creatures and
swapping are harder than `FieldMonsters`/`SwapTracker` (`tuxemon/combat/{field_monsters,session}.py`).
**Recommendation:** build real-time on the existing live core, keep the *data shape* (species/move/
item/encounter, type chart, capture probability), add `timing` (cooldown seconds, windup, range,
hitbox). Start with one creature per side, four abilities, stun/poison only, capture only out of
combat or on a weakened target. For children real-time is conceptually simpler but harder to debug
and balance — provide presets and a visible "why did that hit?" log.

### 7.3 Does this drift from a general RPG maker?

Tuxemon itself drifted into a game: database, actions and UI are saturated with monster concepts
(300+ rows per table, capture devices, Tuxepedia, daycare, park, trading) — `mods/tuxemon/db/`,
`tuxemon/event/actions/`, `tuxemon/states/`. Copying that breadth yields "a monster battler that also
has maps" *(inferred)*. Recommendation: ship the subset as an **optional game system** — togglable
tables + event actions + one combat mode using the same generic hooks (entities, inventory, map events,
damage). The core maker must still ship creatureless games. If real-time steering proves too entangled
with the live combat core, fall back to a one-ability-per-turn battle, not Tuxemon's full status stack.
