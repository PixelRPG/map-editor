# RPG Maker MZ — concept research for PixelRPG Maker

Scope: concepts only, in our own words. No code, no verbatim help text, no assets copied.
Sources: the owner's licensed install (`newdata/data/*.json`, `newdata/js/rmmz_*.js`, `help-en/*.html`).
Relevance ratings are for a **kid-friendly** maker (high / medium / low).

Orientation: MZ is a *database-driven, event-scripted* maker. Almost all game content is rows in
typed tables (the database), referenced by integer id. Behaviour is authored as **event command lists**
placed on maps, in common events, or in troops. The runtime is an interpreter over those lists plus a
fixed set of "scenes" (title, map, menu, battle...). The kid-friendliness problem is that the model is
wide (≈110 commands, ~15 tables, numeric ids everywhere) and the editor assumes the user already knows
what a "self switch" or "trait code" is.

---

## 1. Project / database structure

Project layout: `data/*.json` (one file per table plus one per map), `img/<kind>/`, `audio/{bgm,bgs,me,se}/`,
`effects/` (Effekseer animations), `fonts/`, `icon/`, `js/` (runtime + `plugins/`), `css/`, `index.html`.
Every table is an array whose index 0 is `null`; the row's `id` equals its index. References are plain ids.
Rows all carry `name`, `note` (free text, used as a tag/metadata store for plugins), most carry `iconIndex`/`description`.

| Table | What it is | Key fields (shape in brief) |
|---|---|---|
| Actors | Playable characters | `name, nickname, profile, classId, initialLevel, maxLevel, characterName/Index` (map sprite), `faceName/Index`, `battlerName` (side-view), `equips[]` (one item id per equip slot), `traits[]` |
| Classes | Growth + abilities template | `params[8][99]` (a curve per base stat, indexed by level), `expParams` (4 numbers shaping the XP curve), `learnings[] {level, skillId}`, `traits[]` |
| Skills | Active abilities | `stypeId` (skill type), `mpCost, tpCost, tpGain`, `scope`, `occasion`, `speed, successRate, repeats`, `hitType`, `animationId`, `damage{type,elementId,formula,variance,critical}`, `effects[]`, `message1/2`, `requiredWtypeId1/2` |
| Items | Consumables / key items | `itypeId` (regular/key/hidden A/B), `price, consumable`, same scope/occasion/damage/effects block as skills |
| Weapons | Equipment | `wtypeId, etypeId, price, params[8]` (flat stat bonuses), `traits[]`, `animationId` |
| Armors | Equipment | `atypeId, etypeId, price, params[8], traits[]` |
| Enemies | Monster definitions | `battlerName, battlerHue, params[8], exp, gold, dropItems[] {kind, dataId, denominator}`, `actions[] {skillId, rating, conditionType/Param1/Param2}`, `traits[]` |
| Troops | An encounter group | `members[] {enemyId, x, y, hidden}`, `pages[]` (battle events, see §8) |
| States | Status effects | `restriction` (none/attack enemy/attack anyone/attack ally/cannot move), `priority, motion, overlay`, auto-removal (`autoRemovalTiming, minTurns, maxTurns`), remove-by flags (battle end, restriction, damage with chance, walking steps), 4 message strings, `traits[]` |
| Animations | Visual/sound effects | `effectName` (Effekseer file), `displayType`, `offsetX/Y, scale, rotation, speed`, `flashTimings[] {frame, duration, color}`, `soundTimings[] {frame, se}` |
| Tilesets | Tile image set + flags | `mode` (field/area), `tilesetNames[9]` (A1–A5, B–E slots), `flags[8192]` (per-tile bit field, §2) |
| CommonEvents | Reusable command list | `name, trigger` (none/autorun/parallel), `switchId` (activation switch), `list[]` |
| System | Project-wide config | start map/position, party, title, BGM/ME, vehicles, switch/variable *name lists*, type name lists, window tone, option flags, screen size, fonts, menu command toggles, terms |
| Types (inside System) | Name lists | `elements, skillTypes, weaponTypes, armorTypes, equipTypes` — just arrays of labels, index = id |
| Terms (inside System) | Every user-visible string | `basic` (Level/HP/MP/TP/EXP), `params` (8 stats + hit/evasion), `commands` (menu/battle verbs), `messages` (battle log templates, save/load prompts…) |

Two ideas worth lifting out:

**Traits** (the single most important unifying concept). A *trait* is a small `{code, dataId, value}`
record attached to actor, class, weapon, armor, enemy or state. One list type expresses: element/state
resistance multipliers, stat multipliers (base, extra "hit/evasion/crit" rates, special rates like
damage taken or gold gain), attack element/state/speed/count, adding or sealing skill types/skills,
allowed weapon/armor types, equip locks, extra slots, extra actions, special flags (auto-battle, guard,
substitute, preserve TP), collapse effect, party abilities (halve encounters, no encounters, preemptive
bonus, double gold, double drops). Values stack across all sources of a battler. The editor exposes it as
a plain list: "add trait → pick category → pick sub-option → value" (help: *How to Set Traits*).

**Effects** (the analogous idea for items/skills): `{code, dataId, value1, value2}` — recover HP/MP,
gain TP, add/remove state, add/remove buff or debuff on a stat, grow a base stat permanently, learn a
skill, run a common event, special "escape". Editor: list with "add effect" dialog (*How to Set Effects*).

Relevance: **High** for the table split *Actor / Item / Enemy / Skill / State + a reusable "modifier" list
(traits/effects)* — it is what makes content data, not code. **Low** for exposing numeric class param
curves, 9-element/12-weapon-type taxonomies, or notes-as-metadata to children.

---

## 2. Map model

Map file (`MapNNN.json`) fields: `width, height` (editor limit 256 each), `tilesetId, data[]` (flat array,
see below), `events[]` (index 0 null), `bgm/bgs` + `autoplayBgm/Bgs`, `encounterList[] {troopId, weight, regionSet[]}`,
`encounterStep`, `scrollType`, `parallaxName/Show/LoopX/LoopY/Sx/Sy`, `disableDashing`, `specifyBattleback` +
`battleback1Name/2Name`, `displayName` (shown on entry), `note`.

**Tile data** is one flat integer array of `width × height × 6` entries — six "z-layers":
z0–z3 = four tile layers, z4 = shadow bits (4 quarter-tile shadows packed in one number), z5 = **region id**
(0–255, invisible paint). A 16×… sample map (17×13) therefore has 1326 numbers. Tile id ranges encode the
*kind* of tile:
- **B–E** (ids 0–1023): ordinary tiles, 256 per sheet; B is the main "object" sheet (0 = empty).
- **A5** (1536+): ordinary ground tiles on a single plain sheet (also used for the editor's lower layer).
- **A1** animated autotiles (water, waterfalls, etc., ids 2048+), **A2** ground autotiles, **A3** building
  roofs/walls autotiles, **A4** wall autotiles. For autotiles the id also encodes a *shape index* (which of
  the 47/48 neighbour-fit variants is drawn); the editor recomputes shapes automatically when you paint, so the
  author just paints "grass" and edges appear.
- Tilesets have 9 image slots (A1, A2, A3, A4, A5, B, C, D, E). Tile size is configurable (default 48 px).

**Tile flags** (`Tilesets.json` `flags[8192]`, one 16-bit field per tile id):
- 4 low bits: block passage from each direction (down/left/right/up) — i.e. per-direction passability.
- "star" bit: tile draws *above* characters (tree tops, roofs) and doesn't count for passability.
- Ladder flag (climbable; changes sprite behaviour), Bush flag (lower body half-transparent), Counter flag
  (you can talk to NPCs across it), Damage-floor flag (hurts when stepped on), and a 3-bit **terrain tag**
  (0–7) used by events/formulas ("is this swamp?").
- Editor: Database → Tilesets has tabs per sheet; click tiles to set Passage (○ ✕ ☆ and 4-direction), Ladder,
  Bush, Counter, Damage Floor, Terrain Tag. So passability is authored per *tile type*, once, not per map cell.

Drawing tools (help *Editing Map Designs*): pencil, eraser (clears layers top-down 4→3→2→1), rectangle, ellipse,
flood fill, **shadow pen**, eyedropper (right-click copy), multi-tile stamps by drag-select in the palette, 3 layer
modes (Auto, 1–4 Layer, Event/Region mode). *Auto layer* is notable: the editor picks the correct layer from the tile kind.

**Region IDs** (0–255 painted in a separate "Region" mode) are invisible map-cell labels with no built-in
visuals. Built-in uses: restrict which troops can spawn in which region (encounter scope), block events/followers
"Restrict by region" via plugins/conditions, and queried by "Get Location Info" for logic. Cheap, powerful
"paint a zone" concept.

**Map properties** (help *Map Properties*): name (editor-only) vs display name (shown to player), tileset, size,
scroll type (no loop / loop vertically / horizontally / both — wrap-around worlds), specify-battleback or auto
from terrain, encounter steps (avg steps between fights, 1–999), autoplay BGM/BGS (keeps playing across
map→battle if the same track), disable dashing, parallax image (behind transparent areas; auto-scroll speed −32…32;
a "!" filename prefix means no parallax scrolling offset), memo, encounter list (troop + weight 0–100 + scope: whole
map or region ids).

**Map tree**: `MapInfos.json` = list of `{id, name, parentId, order, expanded, scrollX/Y}` — a folder tree of maps in
the editor's left panel. Maps can be nested for organisation; parent maps are just maps (no special folder type).
Map size caps at 256×256, and an editor-only bookmark of last view position is stored per map.

Relevance:
- Tile layers + autotiles-as-"paint a material": **High** (kids want to paint and not worry about edges).
- Per-tile-type passability authored once in the tileset: **High**. Ladder/bush/counter/damage floor: **Medium**
  (bush/damage floor are fun, simple toggles); terrain tag: **Low**.
- Region IDs: **Medium** (as "zones" with colour + name — a *named* version would be kid-friendly; raw 0–255 is not).
- Map properties: BGM, display name, battle background: **High**; scroll type/parallax: **Medium**.
- Map tree: **Medium** (a world map plus rooms/houses wants nesting).

---

## 3. Events

An **event** is an object on a map: `{id, name, note, x, y, pages[]}`. Behaviour lives in **pages**; the engine
shows the *last* page (highest index) whose conditions are all true; if none qualify, the event is absent.
Page = `{conditions, image, moveType, moveSpeed, moveFreq, moveRoute, walkAnime, stepAnime, directionFix, through,
priorityType, trigger, list[]}`.

**Page conditions** (all enabled ones must hold, an AND): Switch ON, Variable ≥ value, **Self Switch** A/B/C/D ON,
Item possessed, Actor in party. This is how one NPC changes dialogue after a quest step, or how a chest becomes
"open" — the pages are a tiny state machine.

**Self switches**: four per-event booleans (A–D), keyed by (map, event, letter), saved with the game. They avoid
cluttering the global switch list for purely local state (chest opened, door unlocked).

**Trigger types**: Action Button (face + press OK), Player Touch (walk into it), Event Touch (it walks into the player),
Autorun (runs and blocks everything, repeats until it turns itself off via switch/self switch), Parallel (runs
alongside play without blocking).

**Priority**: Below Characters (flat floor things like switches/pits — walkable), Same as Characters (solid NPC),
Above Characters (overhead objects, bridges). Interacts with Through.

**Autonomous movement**: Type = Fixed / Random / Approach / Custom (route), plus Speed (1–6) and Frequency (1–5).

**Graphic**: either a character-sheet cell (sheet + index) or a single tile picked from the tileset (so a "door"
event can reuse a map tile). Image can be none (invisible trigger zone).

**Options**: Walking Animation (cycle frames while moving), Stepping Animation (cycle frames while standing — fire,
water), Direction Fix (don't turn when moving/interacting), Through (ignore collision).

Editor exposes: double-click map cell → event dialog with page tabs (new/copy/paste/delete/clear page), conditions
checkbox group, graphic box, autonomous movement, options, trigger, priority, and the command list in the lower half.
Copy/paste events across maps, "Event Searcher" (find by switch/variable/name/command usage — noted in §13).

Relevance: **High** for the model *object on map + pages with conditions + trigger*. It's the heart of "make a
story". Kids would struggle with page-order semantics and Self Switch lettering; a friendlier UI would present
"When ___ happens → do ___" rules and name the local flags ("this chest is open") rather than A/B/C/D.

---

## 4. The complete event command list

Command codes (from the runtime) grouped like the editor. Roughly 110 commands. One line each.

### Message
- **Show Text** — message window with up to 4 lines, optional face, name box, background (window/dim/transparent), position (top/middle/bottom).
- **Show Choices** — 1–6 options, window position/background, default and cancel behaviour; branches per choice ("When…").
- **Input Number** — player types a number of N digits into a variable.
- **Select Item** — pick an inventory item (by category) and store its id in a variable.
- **Show Scrolling Text** — credits-style auto-scrolling text, speed and "no fast-forward" options.
- **Comment** — a note for the author, never executed.

### Game Progression
- **Control Switches** — set a switch (or range) ON/OFF.
- **Control Variables** — set/add/sub/mul/div/mod with operand: constant, variable, random range, game data, or script.
- **Control Self Switch** — set this event's A–D switch.
- **Control Timer** — start/stop the on-screen countdown.

### Flow Control
- **Conditional Branch** — if/else on: switch, variable, self switch, timer, actor facts, enemy facts (battle), character facing, vehicle, gold, item/weapon/armor owned, button state, script.
- **Loop / Break Loop** — repeat a block, exit it.
- **Exit Event Processing** — stop this event now.
- **Common Event** — run a shared command list.
- **Label / Jump to Label** — named jump targets (goto).
- **Comment** (see above).

### Party
- **Change Gold**, **Change Items**, **Change Weapons**, **Change Armor** — add/remove by constant or variable (clamped 0–99; "include equipped" for gear).
- **Change Party Member** — add/remove an actor (with optional full re-init).

### Actor
- **Change HP / MP / TP** — increase/decrease (entire party, one actor, or by variable), "allow death" option for HP.
- **Change State** — add/remove a state on actors.
- **Recover All** — full heal and clear states.
- **Change EXP / Change Level** — adjust, with "show level-up" toggle.
- **Change Parameter** — add/subtract a base stat permanently.
- **Change Skill** — learn or forget a skill.
- **Change Equipment** — force-equip an item in a slot.
- **Change Name / Nickname / Profile** — text fields of an actor.
- **Change Class** — switch class (optionally keep level).
- **Change Actor Images** — swap map sprite, face, and battler.

### Movement
- **Transfer Player** — teleport to a map position (direct or via variables), set facing, fade black/white/none.
- **Set Vehicle Location** — place boat/ship/airship on a map.
- **Set Event Location** — move an event (direct, variable, or swap with another event).
- **Scroll Map** — scroll camera by distance/speed without moving the player.
- **Set Movement Route** — force a route on player/event (see §6), repeat/skip/wait options.
- **Get on/off Vehicle** — board or leave the current vehicle.

### Character
- **Change Transparency** — hide/show the player.
- **Change Player Followers** — show/hide the party trail.
- **Gather Followers** — pull the trail onto the leader.
- **Show Animation** — play an animation over a character.
- **Show Balloon Icon** — emotion bubble (exclamation, question, heart, light bulb, …; 10 types).
- **Erase Event** — remove this event until the map reloads.

### Picture
- **Show Picture** — slot 1–100, origin, position (direct/variable), scale, opacity, blend mode.
- **Move Picture** — tween position/scale/opacity over frames with easing.
- **Rotate Picture** — continuous rotation speed.
- **Tint Picture** — change colour tone of a picture.
- **Erase Picture** — remove it.

### Timing
- **Wait** — pause event by frames (60 frames = 1 s).

### Screen
- **Fadeout / Fadein Screen** — to/from black.
- **Tint Screen** — shift colour tone of the whole map view (day/night/cave).
- **Flash Screen** — brief colour flash (lightning).
- **Shake Screen** — power/speed/duration.
- **Set Weather Effect** — rain/storm/snow with power and duration.

### Audio & Video
- **Play / Fadeout / Save / Resume BGM**, **Play / Fadeout BGS**, **Play ME** (short jingle that pauses BGM), **Play SE** (sound effect), **Stop SE** — with volume/pitch/pan.
- **Play Movie** — fullscreen video file.

### Scene Control
- **Battle Processing** — start a fight vs a troop (direct, by variable, or "same as random encounter"), can-escape / can-lose, with branches for won/escaped/lost.
- **Shop Processing** — open a shop with a merchandise list and prices, optional buy-only.
- **Name Input Processing** — on-screen keyboard to rename an actor.
- **Open Menu Screen**, **Open Save Screen**, **Game Over**, **Return to Title Screen**.

### System Settings
- **Change Battle BGM / Victory ME / Defeat ME / Vehicle BGM** — override sounds at runtime.
- **Change Save Access / Menu Access / Encounter / Formation Access** — enable/disable features.
- **Change Window Color** — tone of the window skin.
- **Change Actor Images** is in Actor; **Change Vehicle Image** — swap boat/ship/airship sprite.

### Map
- **Change Map Name Display**, **Change Tileset**, **Change Battle Background**, **Change Parallax**.
- **Get Location Info** — read terrain tag, event id at a cell, tile ids per layer, region id, or screen position into a variable.

### Battle (only valid inside troop battle events)
- **Change Enemy HP / MP / TP**, **Change Enemy State**, **Enemy Recover All**, **Enemy Appear** (reveal hidden), **Enemy Transform** (become another enemy), **Show Battle Animation**, **Force Action** (make a battler use a skill), **Abort Battle**.

### Advanced
- **Script** — evaluate JavaScript.
- **Plugin Command** — call a command exposed by a plugin with typed arguments.

Relevance: this list is the full grammar. For kids, roughly a third matters: text, choices, switches/variables,
conditional, transfer, change items/gold, set route, play sound/BGM, wait, screen effects, battle, shop, erase event.
Advanced (Script), picture, movie, screen-tint-with-grays and the 20-odd Actor commands are **low** for the target.
Overall: **High** (as a curated subset presented as visual blocks).

---

## 5. Switches & variables, control flow, common events, parallel processes

- **Switches**: global booleans, named in System (the database stores only a name list; values are runtime state).
- **Variables**: global integers, same naming scheme. Operands can be literal, random, another variable, a piece of
  game data (item count, actor level/HP/stat, party size, gold, steps, play time, timer, map id, player x/y…), or a script.
- **Self switches**: per-event A–D (§3).
- **Conditional branch / Loop / Label / Exit** give structured + goto flow. No functions with parameters: reuse is via
  **Common Events**, which share state only through global switches/variables.
- **Common events** have a trigger: *None* (called by command or by an item/skill effect), *Autorun* or *Parallel*
  (both gated by an activation switch). So a common event can also serve as a global background "system" (day cycle
  clock, HUD updater).
- **Parallel process**: a page or common event that runs every frame concurrently with player control. Needed for
  timers, repeated checks, or HUD logic, but a classic trap (no wait → CPU hogging, easy to freeze). Autorun is its
  blocking sibling and a classic trap too (forgetting to turn it off = softlock).
- **Interpreter model**: each running list has an index, an indent stack for branches, a wait counter; "wait for
  completion" flags let commands block. Only one map interpreter blocks the player at a time; parallels each have their own.

Relevance: switches/variables **High** (but with plain-language names and visible state in the debugger),
common events **High** (named reusable "scripts"), parallel/autorun **Medium** (hidden behind friendly
"always check this" / "cutscene" modes), labels/loops **Low** (loops/conditions are enough), game-data operand **Medium**.

---

## 6. Movement routes, vehicles, followers, region restrictions, jumping

**Movement route** = `{repeat, skippable, wait, list[]}`. Commands (45 codes): 8-way step; random step; toward/away
from player; step forward/backward; **jump(dx, dy)**; wait frames; face (4 directions, turn ±90°, 180°, random, toward,
away); set switch ON/OFF; change speed, frequency; toggle walking anim, stepping anim, direction fix, through,
transparent; change image, opacity, blend mode; play SE; run a script line. Options: *Repeat Movements* (loop),
*Skip If Cannot Move* (don't block on a wall), *Wait for Completion*. The editor offers a "preview" button and a
button palette where each press appends a command. Used both as an event's custom autonomous movement and as the
"Set Movement Route" command (applies to player or any event, even the player's followers).

**Jumping**: a jump is a movement-route command with an x/y offset (−100…100). The runtime computes distance,
then plays an arc over a duration that depends on distance and movement speed (the character's visual y rises and
falls along a parabola; collision is checked at start and end, not during). It also lets characters hop over a wall
if the landing tile is passable. There is no separate "jump button"; the player's jump needs a plugin or an event.

**Vehicles** (System: `boat, ship, airship`, each `{characterName, characterIndex, bgm, startMapId, startX, startY}`):
- Boat: sails on shallow water; Ship: also deep water; Airship: flies over anything, lands on land that allows landing.
- Boarding is "face the vehicle and press OK"; getting off needs an adjacent passable shore tile (the engine checks it).
- Each has its own BGM and sprite; the airship takes a shadow image and altitude animation.
- Which terrain each vehicle can cross comes from which *tile kinds* (A1 water categories) are marked passable-by-boat
  vs land-only — this is data in the tileset autotile type, not per-map.
- Commands exist to set location, change image, and ask "is the player in vehicle X".

**Followers**: party members 2–4 trail the leader along its past steps (a queue of recent positions). Toggled in
System ("Followers") and by commands; can gather. Cosmetic by default (no collision logic on followers).

**Region-based restrictions**: regions are not hardcoded to block movement by themselves in vanilla; they filter
encounter troops by region, are readable via Get Location Info, and plugins/parallel events use them to forbid
areas for NPC wandering. A strong "zone" concept anyway.

**Player-controlled movement**: 4-direction tile steps, dash with Shift (disabled per map), tap/click pathfinding to
the destination (mouse/touch), speed 1–6 (`4` normal).

Relevance: movement routes **High** as an action list (a few commands: step dir, wait, turn, jump, sound);
vehicles **Medium** (boat/ship fun, airship maybe too much); followers **High** (cheap, charming); region restrictions
**Medium**; jump **Medium** (a game-feel nicety); click/tap pathfinding **High** for accessibility.

---

## 7. Message system

- **Message window**: bottom/middle/top; background types window/dim/transparent; up to 4 lines (editor wraps longer
  text across consecutive windows, "batch entry"); shows a **face** (144×144 cell from a 4×2 sheet) at the left; a **name box**
  (speaker label) hovering above; automatic gold window if `\$` is used.
- **Text escape codes** (a mini markup, applied in messages, choices, help texts, names): `\V[n]` variable value,
  `\N[n]` actor name, `\P[n]` party member name, `\G` currency unit, `\C[n]` text colour (indexes into the windowskin's
  colour palette), `\I[n]` inline icon from the icon sheet, `\{` / `\}` bigger/smaller text, `\FS[n]` font size,
  `\PX[n] \PY[n]` position, `\$` gold window, `\.` short pause, `\|` long pause, `\!` wait for key, `\>` `\<` instant text
  start/stop, `\^` close without waiting, `\\` literal backslash. The editor has helper menus for colour/icon/control picks and a preview.
- **Choices**: up to 6, a default option, a cancel branch (disallow / branch / specific choice), window position, background.
- **Number input**: a window with a fixed digit count; result lands in a variable.
- **Item select**: shows the inventory (key item / hidden-item categories); result lands in a variable.
- **Scrolling text**: full-screen vertical scroll; speed 1–8 and optional "no fast-forward".
- **Message behaviour**: typewriter speed from a system option; hold to skip; fast-forward; message is a *blocking* command
  by default. Choices/number-input/item-select reuse the same window pipeline with the "waiting for input" state.
- **Layout is character-driven**: width guidelines for with/without face live in editor settings so authors know
  when text will wrap off.

Relevance: **High** — the "NPC talks" loop is the most important single interaction. Name box + face + position +
a handful of escape codes (variable, name, colour, icon) are **high**; pauses/fonts/PX/PY codes **low**; scrolling
text **medium**; number input **medium** (code locks, simple puzzles); item select **low**.

---

## 8. Battle system

- **Systems** (`System.battleSystem`): `0` classic turn-based, `1` time-progress *Active* (ATB-style gauges fill,
  action when full, everything keeps running while menus open), `2` time-progress *Wait* (gauges stop while the player
  chooses). Orthogonal toggle `optSideView`: front-view (enemies facing a status panel) vs side-view (animated battlers).
- **Triggering**: (a) random encounters — each map has an average step count; the runtime draws a countdown from
  two random rolls, decrements it per step (terrain/party traits can scale it; "no encounters" party trait), then picks a
  troop by **weighted random** from the map's list, filtered by region; (b) the **Battle Processing** event command
  (any troop, can-escape/can-lose flags, win/escape/lose branches); (c) both can use map-set or terrain-derived battlebacks
  (two stacked images: floor + wall) or a blurred snapshot of the map.
- **Troops**: list of enemy positions on a battle screen, plus **battle event pages**.
- **Troop battle events**: pages with a condition *and* a span (battle / turn / moment). Conditions: turn count (start
  + interval), enemy HP ≤ %, actor HP ≤ %, switch. Commands include the Battle category (force action, transform, appear,
  abort). Used for boss phases and scripted fights.
- **Action flow**: party command (Fight / Escape), actor commands (Attack / Guard / Skill / Item; extra commands from the
  database such as skill types), target selection, queued actions ordered by speed, execution with animations and a log
  window of messages from the Terms table.
- **Damage**: each skill/item has `damage{type, elementId, formula, variance, critical}`. Types: none, HP damage, MP damage,
  HP recover, MP recover, HP drain, MP drain. The **formula** is a free expression string evaluated with `a` (user),
  `b` (target), `v` (variables) — e.g. attack vs defence. After evaluation the engine multiplies by element rate (best/product
  of the target's weakness traits), physical or magical damage rate, recovery rate (if negative), applies critical
  (extra multiplier when the hit is a critical), **variance** (± percentage random spread), and guard (damage halved or less
  if the target guards), then rounds. Hit chance = success rate × user hit vs target evasion; magic has its own evasion.
- **Stats**: eight base params (Max HP, Max MP, Attack, Defense, M.Attack, M.Defense, Agility, Luck) plus extra rates
  (hit, evasion, critical, critical evasion, magic evasion, magic reflection, counter, HP/MP/TP regen) and special rates
  (target rate, guard effect, recovery, pharmacology, MP cost rate, TP charge, physical/magical/floor damage, EXP gain).
- **TP**: a third resource that fills when acting/being hit; "special" skills cost TP.
- **States**: restriction types (berserk, confusion, stunned…), auto removal at turn end/action end after a random
  duration between min/max turns, removal by damage with chance, by steps walked on the map, at battle end; stacking
  **priority** decides which state's icon/motion shows; **buffs/debuffs** are separate: temporary ±stat levels (up to 2 stacks
  each way, 25% per stack, fixed duration) shown as arrow icons. Trait lists on states carry the actual effect.
- **Rewards**: EXP shared among the party, gold, and probabilistic item drops (denominator = "one in N").
- **Enemy AI**: an `actions` list; each entry has a skill, a rating (weight), and an optional condition (turn range,
  HP%, MP%, state, party level, switch). The AI picks among valid highest-rating actions.
- **Escape**: success chance rises with each failed attempt; can be disabled per battle.
- **Level up** follows the class curve; skills are learned at the class's `learnings` levels.

Relevance: **Medium**. A battle system is expected for an RPG maker, but for children the sweet spot is far simpler:
turn-based, 3–4 base stats (or HP + Attack + Defense), a handful of states, formulas as "damage = attack − defense" presets
with a dropdown rather than expression strings. Weighted encounters + battlebacks: **high** (cheap, exciting). Time-progress
(ATB) and TP/buffs/variance/crit/elements/AI conditions: **low**. Troop battle events (boss says something at half HP):
**medium**.

---

## 9. Game UI

- **Windowskin**: one image (`img/system/Window.png`, 192×192) that carries *everything*: the nine-slice frame, the
  tiling background, the pause arrow, the cursor corner pieces, the up/down scroll arrows, and a small **colour palette**
  strip (32 swatches used by `\C[n]` text colours). The `windowTone` (RGB offset on the background) is configurable per game
  and by event command. One image + one tone = whole game's UI look.
- **Scenes** (the runtime registry; each is a stack entry with its own windows): Boot, Splash, Title, Map, Menu (command list +
  party status), Item, Skill, Equip, Status, Options, Save, Load, Game End, Shop, Name (on-screen keyboard), Battle, Game Over,
  Debug. Windows are composed: Help window, command list, item/skill list, status block, gold. All reusable base classes
  (`Window_Selectable`, `Window_Command`…) means a custom UI is mostly "assemble a layout".
- **Menu configuration**: System 2 toggles each main menu entry (item, skill, equip, status, formation, save…), item categories
  (item/weapon/armor/key) and which stats show. Terms table renames verbs.
- **Title screen**: two image layers (background `titles1`, frame/overlay `titles2`), a game title text (drawn unless disabled),
  a command window with offset/background options, title BGM. Commands: New Game, Continue, Options.
- **Screen size & scaling**: `screenWidth/screenHeight` (default 816×624, a 4:3 area) and a separate **UI area** size
  (the region where windows live, may be smaller than the screen so they stay inside the "safe area"); an integer screen scale
  (1–4) at launch; the game fits the window with letterboxing; fullscreen toggles on F4.
- **Touch UI**: tap-to-move; on-screen buttons (cancel/menu) from a `ButtonSet.png` sheet; shop number windows get +/−
  buttons; a cancel button appears on the map for touch devices. Designed to run in mobile browsers.
- **Fonts**: main font and number font files (WOFF), a size, and fallback families; per-language font choice via the locale.
  Text sizes can be scaled up/down in messages.
- **Customisation level**: mostly a few images + system toggles; deeper layout changes need plugins (the shipped sample
  plugins replace the menu and save screens with alternative layouts, add picture buttons and text pictures).

Relevance: windowskin-as-one-image + tone: **High** (an easy "choose a look" setting). Fixed screen + integer scaling,
safe UI area: **High** (pixel art needs crisp scaling). Touch controls: **High** if mobile/tablet is a target (children!).
Standard menu scenes: **Medium** (a single simple pause menu with Items/Party/Save/Quit is enough). Title screen layers:
**Medium**. Font options: **Low** (ship one good font), but make it replaceable.

---

## 10. Save system, options, audio, pictures, screen effects, timer

- **Save contents**: a bundle of runtime objects: system (flags, play time, save count, vehicle BGM overrides, encounter
  toggles, window tone, saved BGM position), screen (tint, flash, shake, weather, pictures), timer, switches, variables,
  self switches, actors, party (gold, items, weapons, armors, members, steps), map (what's changed on the current map: tileset,
  parallax, battleback overrides), and player (position, vehicle, followers). **Not saved**: temp state, the live message window, the
  current troop (so saving mid-battle is impossible by design). A *global info* record lists slot summaries (play time, leader face/sprites,
  title) for the load screen. Storage is a file (desktop) or browser storage (web), with a slot-based UI (20 slots by
  default, plus autosave and slot 0 reserved for autosave).
- **Autosave** toggle in System options; **Save Access** command can disable saving in specific places.
- **Options screen**: always dash, command remember (cursor memory), touch UI, and volumes (BGM/BGS/ME/SE). Persisted in
  a separate config file independent of save slots.
- **Audio**: four channels — **BGM** (looping music; fade out; saved/resumed with position), **BGS** (ambient loop),
  **ME** (short musical effect that ducks BGM — fanfares), **SE** (one-shot). Each with volume, pitch, pan. Audio files in
  `audio/<type>/` with ogg/m4a as portability formats.
- **Pictures**: up to 100 numbered image slots layered on top of the map, with show/move/rotate/tint/erase, origin, scale,
  opacity, blend mode, easing; used for HUDs, cutscene art, mini-games.
- **Screen effects**: fade in/out, tone (RGB + gray), flash, shake, weather (rain/storm/snow with power/duration), map name popup.
  Tint persists across battle until changed.
- **Timer**: a single global countdown shown in the corner; can be started/stopped and queried; reaching zero is polled via a branch.

Relevance: saves **High** (obvious need; slot list with summaries + autosave; keep it simple and robust).
Options with volume + dash: **High**. Four audio channels: **High** (simplify to Music/Ambience/Jingle/Effect labels).
Screen tint (day/night), shake, flash, weather: **Medium** (high fun-to-effort ratio, but may be a later wave).
Pictures: **Medium** (cutscene art/HUD; the 100-slot model itself is **low**). Timer: **Low** (nice for challenges).

---

## 11. Plugin system

- **Plugin Manager** (Tools menu): ordered list of JS files from `js/plugins/`, each with an on/off checkbox and a parameter
  dialog. Order matters because plugins override runtime methods. Stored in `js/plugins.js` as `{name, status, description, parameters}`.
- **Header annotations** in each plugin file describe `@target`, `@plugindesc`, `@author`, `@help`, `@param` (typed: string,
  number, boolean, select, file, switch, variable, actor, skill, struct, array…), `@command` (with `@arg`s), `@base` (dependency),
  `@orderAfter`. The editor parses these to *generate UI* — typed parameter pickers (e.g. a file chooser or an actor dropdown) and
  a "Plugin Command" dialog (choose plugin → choose command → fill typed arguments). So plugins extend the *editor* too, not just the runtime.
- **Parameters** are string key/value, parsed by plugin code; structs/arrays are nested JSON.
- **Plugin commands** replaced the MV approach of free-text commands: now declared, discoverable, and validated.
- Shipped samples: alternative menu screen, alternative save screen, button pictures, text pictures. Official plugin catalogue
  (e.g. MaterialBase for deployment asset rules, VisuStella-like community packs are common) is how the long tail of features is handled.
- **Notetags**: free-form text in the `note` field of any database row, read by plugins as metadata — extensibility without schema changes.
- Risks: global monkey-patching → ordering/conflict bugs; unofficial plugins execute arbitrary code (security issue for shared kid projects).

Relevance: **Medium** overall for PixelRPG. The *idea* — declarative metadata (typed params + named commands) that
auto-generates editor UI — is **high** and is what to copy architecturally (as a safe extension API, sandboxed, with typed
command blocks). Arbitrary-JS plugins and notetags: **low** for kids; keep a developer-only path.

---

## 12. Character generator and resource folders

- **Character sheets** (`img/characters/`): a standard sheet is **4 columns × 2 rows of characters**; each character is **3 frames
  wide × 4 directions tall** (down, left, right, up rows; the middle frame is the "standing" pose and frames 1-2-3-2 loop for walking).
  Default cell 48×48. Filename prefixes change interpretation:
  - `$` — the file holds exactly *one* character (not 8); useful for big or single-sprite objects.
  - `!` — object sprite: no 1/8 vertical offset, not half-transparent on bush tiles (doors, chests, signs).
  - `$!` — both.
  Events/actors reference *sheet + index (0–7)*, so a single PNG hosts eight characters.
- **Face sheets**: 144×144 cells arranged 4×2 = 8 faces per file.
- **SV actor sheets**: a large fixed-layout sheet of battle motions (idle, walk, guard, damage, evade, attack swing, thrust, missile, skill, spell, item, escape, victory, dying, … ) in rows of 3 frames.
- **Resource folders**: `img/{battlebacks1, battlebacks2, characters, enemies, faces, parallaxes, pictures, sv_actors, sv_enemies, system, tilesets, titles1, titles2}`, `audio/{bgm, bgs, me, se}`, `effects` (animations), `fonts`, `movies`.
  Subfolders are allowed; each picker shows the folder tree with preview. PNG only for images. Editor's **Resource Manager**
  imports/exports assets (and a Material base package includes licensed sample art).
- **Character Generator** (`generator/`): a part-composited paper-doll tool — choose parts (body, face, hair, clothes, accessories,
  back/front layers), recolour with palettes/hue shifts, preview walking, and export a sheet-conformant PNG for sprite + face + sv-actor
  so a new hero needs no art skills. Parts are layered images that the tool merges into the standard layout.
- **System images**: balloon (emotion icons), button set (touch), game over, icon set (a grid of 32×32 icons indexed by number —
  one image for all item/skill/state icons), shadows, states (side-view state overlays), weapon sheets (side-view attack swings), window skin.

Relevance: standard sheet layout + a recognisable index-per-cell convention: **High** (kids can draw 12 frames; clear
spec). Character generator as layered paper doll: **High** — it's the "no art needed" on-ramp. One-icon-sheet-indexed-by-number: **Medium**
(good for item icons). `$`/`!` filename prefixes: **Low** as filename magic; the *behaviour* (single sprite / object-vs-character)
should be explicit metadata instead.

---

## 13. Everything else notable

- **Test play**: one button runs the game in a window starting at the selected map (hold-modifier options for "battle test" with a
  chosen troop and test battlers, and a debug scene in-game that lets you flip switches and edit variables live — a Debug scene is
  part of the runtime). Play-test starts at the player-start position defined in System.
- **Editor modes**: Map, Event, Region, Mode-specific toolbars; **layers**; **zoom** and **grid**; **map shift** (shift all map
  content by N cells in a direction — fixes "I placed everything one tile off").
- **Event Searcher**: lists events across the project matching name, switch, variable, self switch, item, or command usage —
  invaluable once a project has hundreds of events.
- **Auto-run protection**: the manual warns Autorun can lock the game; a debug aid in test play to break out.
- **Copy/paste of events, pages, commands**; multi-select drag in command lists; **find/replace** inside text; **drag-n-drop** for resources.
- **Deployment targets**: Windows folder, macOS app, **web browser** (upload folder to a server); mobile browsers (iOS 12+/Android 8+)
  supported via HTML5; options to **exclude unused files** (analyses references), exclude by extension/path, and **encrypt** images/audio.
- **Localization hooks**: `System.locale` and `gameTitle`, plus the Terms table, plus message plugins for translation; no first-class string-table
  localization workflow (strings are embedded in commands).
- **Data conversion/versioning**: MV → MZ converter; JSON format level (minified / per-record lines / pretty) for human diffs — *interesting for
  version control and sharing*.
- **Reference data**: Samples + DLC folders (`newdata-1/2/3`, `samplemaps`) — ready-made starter projects and maps; Tutorial.exe — in-editor intro.
- **Steam/market and licensing**: assets licensed to personal use inside games built with the engine — the opposite of PixelRPG's open stance.
- **Documentation structure**: one help topic per command, per database tab, per map property: a *reference* manual, not a task-oriented tutorial.

Relevance: test-play with debug panel **High**; event searcher **Medium**; map shift **Low** (undo/move-selection is better);
web/mobile deployment **High** (instantly shareable with friends); encryption **Low**; starter projects/sample maps **High**.

---

## Top 15 concepts PixelRPG should consider

Ranked by (kid value × distinctiveness for our product). "Adopt" means adopt the idea, not the MZ shape.

1. **Event pages with conditions + triggers** — an object on the map has several "states" (pages), the last matching one wins,
   and a trigger (talk / touch / auto / always) starts a list of actions. Hide pages and self-switches behind friendly wording
   ("after you have the key…", "this chest was opened").
2. **Curated, visual command list** — choose about 25–30 blocks (talk, ask, give, take, teleport, wait, sound, music, move, fight, shop, set/check flag…)
   and render them as block cards with icons, not a 110-item menu.
3. **Switches and variables with names, and a visible debug panel** — global flags/counters, per-object "local" flags;
   show current values during test play so kids can see why something happened.
4. **Autotile-style "paint a material"** — painting grass/water/cliff auto-picks edge variants; with layered ground/object/overlay
   layers (Auto layer mode picks the right one), a shadow-pen equivalent, and an eraser that peels layers top-down.
5. **Per-tile-type properties set once in the tileset** — passability (4-direction), "draw above characters", bush, damage-floor,
   ladder/counter; plus per-cell **zones/regions** (named, coloured) for encounters/triggers.
6. **Message system with face + name box + position + small markup** — a handful of inline tokens (player name, variable value,
   colour, icon, pause); typewriter text; choices with a cancel branch; optional number input for code locks.
7. **Test play with debug scene** — start from the current map, a live switch/variable editor, jump to any map, battle-test button.
8. **Character-sheet convention + paper-doll character generator** — 3 frames × 4 directions per character, multi-character sheets,
   explicit "object vs character" and "single vs multi" metadata (instead of `$`/`!` filename magic); a generator so no art is needed.
9. **Data-as-tables with ids and a shared "modifier list"** — Actors/Classes/Items/Skills/Enemies/States, plus traits (passive modifiers) and
   effects (item/skill outcomes) as small typed records, edited via an "add effect" picker rather than free-form code.
10. **Common events (reusable named routines)** — with a *none / always-running / cutscene* trigger and an activation flag; avoids
    copy-paste for things like "heal the party at an inn".
11. **Movement routes as pictorial step lists** — direction, wait, turn, jump, speed/animation toggles, "repeat" and "skip if blocked";
    reused for NPC patrols and cutscenes.
12. **Followers (party trail) and click/tap pathfinding** — cheap charm and accessibility for children and tablets.
13. **Encounter model** — weighted random troops per map/zone, average steps between fights, battle background chosen from terrain,
    escape allowed or not; with a deliberately small turn-based battle (HP, Attack, Defense, a few skills, 3–5 states).
14. **Typed extension API with generated UI** — declare typed parameters and commands in metadata so the editor draws pickers and
    command dialogs for them (plugin-style); sandboxed, no arbitrary code in the kid path.
15. **Save/load, options, one-image windowskin, integer screen scaling + safe UI area, touch UI, web/mobile deploy** —
    slot saves with summaries and autosave, volume and dash options, one image + tone to re-skin all windows, crisp scale
    for pixel art, on-screen buttons, and "share as a web link".

Honourable mentions (medium/low): picture layers for cutscenes and HUD, weather/tint/shake presets, vehicles (boat first),
named-map tree, event searcher, JSON pretty-print level for readable diffs, `note`-style per-row metadata (as typed custom fields).

Things MZ does that we should **not** import for kids: raw numeric id pickers everywhere; Autorun/Parallel footguns
without safeguards; free-text damage formulas and trait codes; 100-slot picture model; filename-prefix magic; MV-era
script command as a primary tool; proprietary asset licensing.
