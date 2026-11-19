# RPG Maker editors: UX and evolution (2003 → VX Ace → MV → MZ)

Research notes for PixelRPG Maker. Everything below is paraphrased in our own words from the
owner's licensed installs (MZ help, MV help, VX Ace and 2003 CHM manuals, MV install tree).
No code, help text or assets are copied. Facts that come from general knowledge rather than
the installed material are marked **(unverified)**.

Scope: how the editors are *operated*, and how concepts moved across four versions.
Data model/runtime is covered by a sibling report.

---

## 1. Editor workflow

### 1.1 Main window anatomy (MZ; VX Ace and MV are near-identical)

One window with fixed regions:

| Region | Role |
|---|---|
| Menu bar + toolbar | File, Edit, Mode, Draw, Layer, Scale, Tools, Game, Help; toolbar repeats the hot ones |
| Tile palette (top left) | Shows the current map's tileset in tabs; in event mode it turns into an event list |
| Map tree (bottom left) | Hierarchical list of all maps; also holds map copy/paste, sample-map import, save-as-image (MV) |
| Quick Access strip | MZ addition: pin frequently used maps so you stop scrolling the tree |
| Map view (right) | The canvas; doubles as the event placement surface |
| Status bar | Selected tool, map name, cursor coordinates |
| Layer buttons | MZ addition: Auto / 1 / 2 / 3 / 4 |

Observation: the whole editor is **one canvas plus a context-sensitive left panel**. The
palette's content is decided by the current *mode*. That is a strong, learnable pattern.

### 1.2 Modes

The Mode menu (and toolbar) switches what a click on the canvas means:

1. **Map mode** – click/drag places tiles. Palette shows tiles.
2. **Event mode** – double-click an empty cell to create an event, double-click an icon to edit,
   drag to move. Palette becomes a flat list of the map's events; selection is synchronised
   both ways (click list → highlights on map, click on map → highlights in list).
3. **Region mode** – an extra tab on the palette (the "R" tab). You paint numbered regions
   (MV: up to 255; VX Ace: 63) as invisible metadata. Regions drive random-encounter areas and
   can be queried by events/plugins. They are an invisible, second paint layer.
4. **Shadow pen** – a tool rather than a mode: toggles a quarter-tile shadow at the clicked spot.
   Shift-drag does rectangular add/remove.
5. **Show passability** – an overlay mode: draws X marks where tiles block walking.

Older versions had fewer modes: 2003 had only upper-layer/lower-layer edit modes
(chosen in a menu) plus event mode; VX Ace introduced the single "map tab" with
palette tabs A–E.

### 1.3 Drawing tools

All versions: pencil, rectangle, ellipse/oval, flood fill. 2003 additionally had
select-area, cut/copy/paste of map regions, and a zoom tool, but only **3 undo steps**.
MZ: undo of up to **20** actions (project-wide edit menu, not per-map).
VX Ace onward: eraser (MZ: eraser clears layers top-down 4→3→2→1 on a cell), shadow pen.

Eyedropper behaviour is unusual and worth noting: **right-click copies, left-click pastes**,
and right-drag selects a multi-tile stamp. Multi-tile selection in the palette is also by drag.
So "stamps" are first class from the palette, not a separate feature.

Autotile override: holding a modifier key while drawing temporarily disables autotiling
(VX Ace/MV/MZ).

### 1.4 Tile palette tabs and layering

- Tabs **A–E** are *fixed categories by role*, not by theme:
  - A = animated/auto-tile terrain (A1 animated water, A2 ground, A3 building roofs/walls,
    A4 wall tops/sides, A5 flat non-auto tiles),
  - B–E = free "upper" tiles (objects, decor, trees, furniture).
- The palette is one **image sheet** per tab, assigned to a *tileset* record in the database.
  A tileset record also carries per-tile flags (passability, 4-direction passability,
  ladder, bush, counter, damage floor, terrain tag).
- Layers: three visible layers (two lower autotile layers + upper) plus a shadow/region layer;
  MZ exposes "layer 1-4" explicitly. Before MZ, layers were **implicit**: the editor decided
  where a tile lands by its tile type and what's already under it. The manual spells out
  surprising rules (a 3rd stacked upper tile erases the 1st; star tiles always render on top;
  an impassable tile overrides a passable one regardless of order; decorative A2 tiles only sit
  on base A2 tiles). Newcomers cannot guess any of these.
- MZ's answer is **Auto + explicit layer buttons**: Auto behaves as before; picking Layer N
  highlights only that layer's tiles so you can edit it without disturbing others.
- Autotiles: one tile image bundles ~47 neighbour variants; the editor chooses the variant from
  the surroundings. Autoshadows add a bottom-right drop shadow below cliff/wall tiles.
- 2003: autotiling existed only for sea and "normal terrain" (12 types); the palette was split
  into *lower layer* and *upper layer* tiles; animated tiles (waterfall etc.) were a separate
  class of 3.

### 1.5 Map properties

Dialog opened when creating/editing a map. It holds: editor name vs. display name (shown to the
player), tileset, width/height (up to 256), loop type (none/vertical/horizontal/both),
background music/sound auto-play, battle background override, encounter list with
regions, **average steps between encounters**, parallax background, note field.

Note the split **editor name vs. display name**: the editor name is for the author only.

### 1.6 Map tree operations

Right-click: edit properties, new, load sample map, copy/paste, delete, shift, save as image
(MV+), add/remove from Quick Access (MZ). Maps are leaves of a tree, folders are expressed
by parent-child relationship (a map can parent other maps), not separate folder nodes.
The tree is *only* for organisation; world connectivity is purely events (transfer commands).

### 1.7 Test play

- Playtest is a toolbar button/F12; launches the game window from the current start position
  (MZ/MV: hold a key or use the player-start marker; right-click map → "set start position").
- In MV/MZ, events can be **tested in isolation** from the event dialog (the "Test" button on a
  selection of command rows) — useful for pictures/movement without a full playtest.
- Battle test exists in the database (troop tab) with a party you choose.
- MZ's event editor also offers "Toggle skip" (comment-out a block with a shortcut).
- Games are launched as separate processes, not embedded. No live reload of the map being
  edited.

### 1.8 Quick event creation (right-click in event mode)

Four templates, which are the single best onboarding idea in the whole product:

| Template | What it produces (own words) |
|---|---|
| Movement/Transfer | An invisible event that teleports the player to a chosen map/location/facing — doorways, stairs |
| Door | Same, but with a door sprite attached |
| Treasure | A chest-like event that pays out gold/item/weapon/armor **once** (uses a self-switch internally) |
| Inn | Pay a price, restore party, fade out/in |

These produce ordinary events the author can open and edit later — so the template is a
"scaffold" rather than a black box. The first three are what 90% of early games need.

### 1.9 Event searcher

(MV 1.x+, in Tools.) Finds events by name, by switch, or by variable and shows a list; double-click jumps to the event. It answers the classic question, "where do I turn this switch ON?", which in a switch-based design is otherwise unanswerable.

### 1.10 Database editor layout

One modal-ish window with **tabs per record type** (MZ has 15 types):

actors, classes, skills, items, weapons, armor, enemies, troops, states, animations, tilesets,
common events, system 1, system 2, types, terms.

Each tab has the same 3-column layout: **left: numbered list** (with a "change max" button),
**middle: form for the selected record**, **right: traits/effects list or notes**.
Records are addressed by ID number (the number is the true key, the name is cosmetic).
Since VX Ace, behaviour is expressed through two generic lists:

- **Traits** (formerly "features"): permanent modifiers on actors/classes/equipment/enemies/states — "this thing gives +x to a parameter, resists an element, adds a skill type" etc.
- **Effects**: one-shot outcomes of skills/items — "restore HP, add state, learn skill, grow a parameter".

This is the product's most important design idea: a small vocabulary of composable modifiers
instead of dozens of hard-coded checkboxes. It replaced a heap of special-case fields
in 2003/VX.

Other conventions: damage formula is a text expression box; "System 1/2" hold game-wide
options (start party, vehicles, window colour, battle system, which screens are enabled,
starting position, title screen); "Terms" is the localisation/wording table;
"Types" is for element names, skill types, weapon types, armour types.

### 1.11 Resource manager

Opened from Tools. It is a two-pane tool: folder list (by resource type, e.g. battlebacks,
characters, faces, tilesets, audio) and file list, with import / export / delete / preview and
an audio tester (volume, pitch). It is where you discover that **resources are plain files in
type-named folders**; the editor mostly reads those folders at runtime to build the
pickers. VX Ace and 2003 had this as a modal tool; MZ dropped the dedicated manager and
relies on file copy into the project plus the pickers (the manual says: copy the file into the
folder and it appears in the picker; sub-folders allowed).

2003 detail: the manager listed resource kinds including backdrop, battle animation sheets,
large animation sheets, and was the *only* path for bringing assets in. A "transparent colour"
picker applied at import (VX Ace: left click for transparent colour, right click for
translucent colour) — an old palette-based worldview.

### 1.12 Character generator

Tools → Character Generator (inherited from a free web "chibi maker" per the VX Ace manual).
Tabs per body type (VX Ace: male/female; MV adds **kid** in a late update; MZ keeps all three).
Per slot (hair, face, clothes, accessories…): variation, colour and offset. A **Randomize** button, save/load of the recipe, and export targets: face portrait, walking sprite, damaged sprite, side-view battler.
One recipe → four deliverables, which keeps a character visually consistent across screens.

### 1.13 Plugin manager (MV, MZ)

List of plugin files with ON/OFF checkbox. Double-click an empty row → choose from `js/plugins`.
Each plugin declares its own typed parameters (via structured annotations in its header);
the manager renders them as a form with file pickers, number fields, and special
right-click inserts (icon number, colour index, control character). Ctrl+F searches the list,
and also searches plugin help in the settings dialog. MV added "Edit as text" and
the list search later. MZ added *plugin commands* with typed arguments — i.e. plugins
can register dialogs inside the event command list.

---

## 2. The event editor as UI

### 2.1 Structure of an event (what you have on screen)

An event is a small program with a **placement** (on the map) and **N pages**. In the dialog:

- header: ID (auto), name (cosmetic), memo
- page tabs (numbered 1..N) plus new/copy/paste/delete/clear page buttons
- left column (per page): **conditions** (switch, variable, self-switch, item, actor — all optional, ANDed), **image** (character sprite or a tile), **autonomous movement** (type fixed/random/approach/custom route, speed, frequency), **options** (walk anim, step anim, direction fix, through), **priority** (below/same as/above characters), **trigger** (action button, player touch, event touch, autorun, parallel)
- right column: **contents** — the command list.

Rule of the page system: **the highest-numbered page whose conditions are all true wins.**
There is no "else"; you build a state machine by creating pages in order.

### 2.2 The command list

A vertically scrolling, indented list. Each row starts with a diamond marker; nested blocks
(conditional branch, loop, choices) are indented children. Operations: double-click a row to
edit, double-click the empty last row to *insert*, right-click for copy/cut/paste/delete,
shift-click to multi-select, "copy as text"/"copy as HTML tags" (MV 1.3+), a test button
(run the selection), toggle skip.

### 2.3 Insert dialog

A modal with **3 tabs** (MZ) and commands grouped under headings:

- **Tab 1:** Message (text, choices, input number, select item, scrolling text) · Game progression (switches, variables, self-switch, timer) · Flow control (conditional branch, loop, break, exit, common event, label, jump, comment) · Party (gold, items, weapons, armour, members) · Actor (HP, MP, TP, state, EXP, level, parameter, skill, equipment, name, class, nickname, profile).
- **Tab 2:** Movement (transfer player, vehicle location, event location, scroll map, move route, vehicles) · Character (transparency, followers, animation, balloon, erase event) · Picture · Timing (wait) · Screen (fade, tint, flash, shake, weather) · Audio and video.
- **Tab 3:** Scene control (battle, shop, name input, open menu/save, game over, title) · System settings (battle/ME/vehicle BGM, access flags, encounters, formation, etc.) · Map (change name display, tileset, battleback, parallax, get location info) · Battle (change enemy HP/MP/TP/state, recover, appear, transform, show battle animation, force action, abort) · Advanced (script, plugin command).

About a **hundred** commands. The tab split is an arrangement by *topic of effect*, not by
task, and the labels are engine vocabulary ("Control Self Switch", "Change Parameter").

### 2.4 The "set movement route" sub-editor

A second modal with its own command list (move up, turn, wait, speed, change graphic,
script). MZ added a **route preview** in the map view — the one place the editor lets the
author *see* the effect of a command before running the game.

### 2.5 The condition panel

Five check-categories on the left (switch, variable, self-switch, item, actor). Switch and
variable pick by **ID number from a big list**. Variable conditions are "greater than or
equal" only (the 2003/MZ manuals both phrase it as a threshold) — equal/not-equal need an
in-list conditional branch instead.

### 2.6 What is hard for beginners (concrete)

1. **Switches and variables are global numbered cells** (e.g., "switch 0023: ?"). The
   author must name and track them manually; the editor has no built-in map of who sets and
   who reads them (hence the Event Searcher added in MV).
2. **Self-switches A–D** are per-event, hidden state. The treasure template uses one, but
   nothing on the canvas shows it; people reproduce "chest opens once" by hand with a global
   switch and burn numbered switches.
3. **Pages as state machine**: "last page whose conditions hold wins" is learnable but
   invisible; there is no preview of which page is active or why.
4. **Trigger confusion**: action button vs. player touch vs. event touch vs. autorun vs.
   parallel. Autorun without a way out locks the game; parallel without a wait floods the engine.
   These are the most common "my game freezes / lags" stories.
5. **Priority + through + direction fix** are three flags that interact; the visual result
   (can I walk behind the tree?) is a mix of tile settings, event priority, and the tileset's ☆ flag.
6. **Tileset flag errors** (forgot a passability flag) appear at runtime as "I can walk through
   walls" with no editor hint except the optional passability overlay.
7. **Indentation-based flow** (nested branches, `Else` markers, `End` markers): deletion of the
   opener leaves orphaned structure for a moment; copy/paste across branches is error-prone.
8. **Variable arithmetic** has operand pickers with many sources (constant, variable, random,
   game data, script) in a dialog that mixes types; MZ added "just prior" operands to avoid
   per-case variables for common checks.
9. **Plugins**: unofficial plugin load order matters; conflicts and missing parameters
   produce a blank screen or console-only error (MV/MZ).
10. **Event ID as identity**: events are referenced by number; deleting and re-adding one can
    silently break references; page IDs also shift on delete (the manual states that later
    page numbers drop by one).

---

## 3. Version evolution table

Sources for each cell: 2003 and VX Ace CHM manuals, MV and MZ help, plus MV's installed tree.
"(unverified)" means from general knowledge.

| Concept | RPG Maker 2003 | VX Ace | MV | MZ |
|---|---|---|---|---|
| Native screen | 320×240 **(unverified)**, 16px tiles | 544×416, 32px tiles | 816×624 (manual: raised from 544×416), 48px tiles | 816×624 default; a "HD layout" starter project at 1280×720; resolution and font configurable in the editor |
| Tile layers | Two: lower and upper; the edit mode menu picks which | Three displayed layers via palette tabs A–E; layer chosen implicitly | As VX Ace, plus better stacking: upper two tiles overlap automatically | Same data, but **explicit layer selector** (Auto, 1–4) with highlight of the active layer |
| Autotiles | Sea + 12 normal terrain types, 3 animated types, fixed set | Full autotile system A1–A4 with autoshadow; shift to disable | Same; regions raised to 255 | Same; shift-disable; layer-aware |
| Shadows | none | Shadow pen, quarter tiles | Same | Same |
| Regions | Areas (rectangles) for encounters | Region paint, 63 values | Region mode tab in palette, 255 values | Same as MV; used in map properties for encounter groups |
| Battle system | Traditional front-view plus alternative ATB mode with a "wait" switch (the manual has a toggle command for it) and a sideview option **(unverified)** | Front view, turn based | Front view **and** a new side-view battle with visible actors and motions | Turn-based or time-progression (TP gauge fills; first to 100% acts); side view kept; touch-selectable targets |
| Character format | Spritesheet sets by type (charset/chipset/faceset) in a resource manager | Walk sheets 3×4 per char + faces 4×2; Character Generator (chibi maker ported) | Walk + face + side-view battler; generator adds "kid" | Generator revamp: parts position offsets, damaged-pose, battler export |
| Database | Fixed forms per type; special-purpose fields | **Traits + Effects** lists introduced; formulas as text | Same; TP, profile | Same; skill/item improvements, "types" and "terms" tabs |
| Scripting | None for authors in the usual sense (event commands only; fixed engine) | **RGSS3 – Ruby**, editable engine scripts inside the editor | **JavaScript** plugins, structured parameters, plugin commands as typed text | JS plugins with **typed plugin commands** presented as editor dialogs; official plugin set |
| Platforms | Windows | Windows | Windows, macOS, Linux (late update), **HTML5**: web, Android, iOS | Windows, macOS, web; browser/touch as default scheme |
| Deployment | Compress game data (via installer feature) | "Compress game data" with optional RTP inclusion and encryption | Deployment dialog per platform, optional encryption | Same, plus game ID to distinguish creations for web saves |
| Touch UI | n/a | n/a | basic touch/click | menus designed for PC/phone dual use, swipe-scroll in windows, touch targets in battle |
| Autosave | no | no | no | yes: top save slot, saved after battles and on transfers; can be disabled |
| Save slots | 16 **(unverified)** | 16 | 20 | 20 |
| Resource model | Resource manager with fixed folders | RTP (runtime package) shared assets + project assets | Assets copied in project; DLC packs | Assets copied; subfolders allowed; all images PNG |
| Event helpers | Event list, no quick create | **Easy create** (4 templates) | Same; event test in isolation, event searcher, copy as text/HTML | Same; route preview; toggle skip; plugin commands |
| Data format | Binary/LCF **(unverified)** | Marshal (Ruby) | JSON | JSON (editor can convert MV projects) |

### 3.1 Why the concepts moved (reading across the manuals)

- **Fixed-database → composable (2003 → VX Ace).** Each new feature was a new checkbox. The VX
  Ace manual itself says the database was "dramatically revamped" with traits and effects so
  that many things formerly separate can be combined freely. This is the root move that made
  later plugin ecosystems possible.
- **Native editor + Ruby → web tech (VX Ace → MV).** Ruby/RGSS was Windows-only and
  engine-in-a-DLL. MV moved to HTML5/JS to reach macOS, Linux, browsers, phones. Cost:
  authors who can't code move to plugin shopping instead.
- **Screen up and tile size up.** 32px → 48px tiles, 544×416 → 816×624, to match modern
  displays; MZ makes resolution configurable. Aspect ratio stays 4:3 by default for
  compatibility with old art.
- **Edit features that remove hidden rules (MV → MZ).** Explicit layer picker,
  movement-route preview, input protection against bad numbers, MV data converter — MZ's list
  of "environment improvements" is basically *remove mistakes that only show up at runtime*.
- **Mobile as an actual target (MZ).** Menus redesigned, swipe scroll, touch targets, autosave
  (because phones suspend apps), game ID for web saves.
- **Battle tempo (MZ).** Time-progression battle is the answer to "turn menus feel slow";
  MV's battle speed-up notes show the same direction.

---

## 4. Kid / beginner friendliness

### 4.1 What works well

- **Learn by playing**: MZ's new-project dialog offers four starts: bare data, a *playable
  tutorial*, data with sample maps, and a layout project for a PC screen. Starting from a
  tutorial that is itself a game is a strong idea.
- **One-canvas mental model**: draw map, double-click to add things. The mode switch is the only
  big concept.
- **Four quick-event templates** cover transfer, door, treasure, inn: the beginner gets a
  working loop in 30 seconds.
- **Auto-tiling**: place grass next to water and the shore appears. Directly rewarding.
- **Character generator with randomise** gives children a "my hero" in a minute, and the same recipe produces matching portrait, walker and battler.
- **Instant playtest** from the toolbar.
- **Sample maps** loadable from the map list.
- **Starter data that already works** (a default party, items, a first map).
- **Autosave and touch UI** in MZ show that the audience is not only PC power users.
- **Cosmetic names** (events, maps) are free text, unlike ID keys.

### 4.2 What is confusing (see §2.6 for event-specific list)

- Everything is **number-keyed**: switch 12, variable 8, enemy 003. A child can't hold that
  in mind. The editor shows the number first and an author-chosen name second.
- **Hidden layer rules** in palette tabs (A vs B–E, stacking exceptions, star tiles). Even
  MZ's layer picker needs prior knowledge of what the four layers *are*.
- **Tileset prep**: to use own art you must assign images to the A1–E slots with the right
  geometry, then flag passability per tile; mistakes show up late.
- **Terms**: "Trigger", "Parallel", "Autorun", "Priority", "Through", "Traits", "Effects",
  "Troops", "Self Switch" — vocabulary of a programmer.
- **A hundred commands** in a modal with three tabs. Search in this dialog does not exist
  (unverified for MZ; the manual lists tabs only).
- **No undo across scopes**: undo limited to 20 steps (MZ) or only 3 (2003).
- **Sprite sheet standards** (3×4 frames, "$" and "!" filename prefixes to change
  behaviour — the MZ asset page notes a leading "!" turns a parallax into a floor) are
  hidden convention-by-file-name.
- **Plugin dependency**: the best features live in third-party plugins (MV's DLC lists
  community packages by several well-known authors), and those arrive with load-order and
  conflict problems.
- **Desktop-only authoring** across all four versions. Nothing in the editor works on a phone.

### 4.3 Adopt, adapt, or avoid for a phone-first child-friendly maker

| Idea | Verdict | Why |
|---|---|---|
| Single canvas + modes, context-sensitive side panel | **Adopt**, but as a bottom sheet/toolbar on phone | Learnable; palette follows mode |
| Autotile as default | **Adopt**; no manual tile-edge rules | Instant gratification |
| Quick templates (door, chest, NPC dialog, shop, inn, enemy) | **Adopt, expand**; make them the primary creation path, not a hidden context menu | Covers most needs |
| Free-form numbered switches/variables | **Avoid** in the beginner path; use named flags created on demand, scoped per object by default ("this chest is opened") | Number cells are the #1 confusion |
| Pages with "highest satisfied page wins" | **Rework**: show states as labelled cards ("closed" / "open") with an explicit "when…" sentence | Visible state machine |
| Trigger zoo | **Reduce to 3** (tap/interact, step on, automatic once) for kids; keep others in an expert panel | Prevents freezes |
| Command list text | **Rework**: blocks with icons, drag to reorder; a "say / give / go to / wait / if" starter set of ~12 | Hundred commands intimidate |
| Tilesheet slot geometry (A1–E) | **Avoid**; import any image and auto-slice; role (floor/wall/object) chosen by tags | Remove the footgun |
| Character generator with random + export to all views | **Adopt** | Fastest emotional payoff |
| Autosave | **Adopt**; also autosave the *editor* | Phones suspend apps |
| Quick Access/pinned maps | **Adopt** as "recent places" | Small, helpful |
| Event searcher | **Adopt as "where is this used?"** from any named thing | Answers the hidden-state question |
| Undo 20/3 steps | **Improve**: deep undo with a history strip | Kids experiment |
| Play-test from toolbar | **Adopt**, make it one tap, resume from the player's current position on the map | Fast loop |
| Tutorial-as-game new project | **Adopt** | Teaches by doing |
| Plugin manager | **Avoid** exposing it to kids; provide curated "game rules" packs with simple toggles | Safety and clarity |
| Ruby/JS scripting | **Defer**; maybe a later expert tier | Not the audience |
| Region painting | **Adapt**: call it "zones" (encounter area, music area) with colour and name | Powerful but needs a friendly name |
| Shadow pen | **Adapt**: auto shadows only | A manual shadow brush is polish, not necessity |
| Right-click copy / left-click paste eyedropper | **Avoid** (right click doesn't exist on touch); use long-press pick | Touch parity |
| Modal dialog stacks (event → page → command → sub-editor) | **Avoid**; use inline editing / sheets with one level | Phone screens |

---

## 5. Helper tools (MV install tree)

Observed in the MV install: three small helper apps beside the editor, plus a character
generator folder with parts sorted by body type and view (face, side-view, walking, kid
variants) and its own locale folders. The `tool` directory has three codenamed subfolders
(`GENE`, `MADO`, `SAKAN`) matching the generator, window builder and scene builder
(naming inferred from the folder names and the Mac app bundles: Generator, Window Builder,
Scene Builder, Tileset Builder). I only listed folders and read the help changelog; I did not
launch them. The notes on purpose are partly **(unverified)** interpretation.

| Tool | Concept it covers |
|---|---|
| **Character Generator** (also in Tools menu) | Compose a character from parts; export portrait, walker, damaged pose, battler |
| **Tileset Builder** | Assemble a tileset image from loose tiles/parts into the A–E sheet layout and slot rules **(unverified)** |
| **Window Builder** | Design the look of UI windows (frames, skins) visually **(unverified)** |
| **Scene Builder** | Lay out whole UI scenes (menu/title/status screens) visually **(unverified)** |

The MV changelog says these "tools" were made usable together with the editor (March 2017),
and that **tutorials (beta)** were added around then. The Tileset/Window/Scene tools reflect
the same observation: authors want to change *how the game looks* without writing code, but the
engine's look lives in image sheets and hard-coded window classes.

Other MV DLC (listed only by kind): music/SE packs, character graphics packs, train
tilesets, "kids" generator parts, modern-style generator parts, dark-fantasy characters,
cover-art characters, parallax backgrounds, wallpapers, a "freebies" bundle, plugin
collections from the publisher and community authors, a themed (historical China) pack, and
a magic/special effects pack. The ecosystem is **assets and behaviours sold separately**, with
plugins as the extension point. Plugins in the publisher's sets cover: alternative menu and
save screens, enemy/item "books", message styling, hit/switch handling, extra equipment types,
fixed battle members, side-view tweaks, picture wipes. MV's bundled sample plugin folder
itself is small (menu/save/title/message/weapon-skill helpers, a "made with" splash).

---

## Top 10 UX lessons for PixelRPG

1. **One canvas, modes decide what a tap means; the side panel follows the mode.** Keep the
   palette/bottom sheet context-sensitive, and show the mode clearly (chip or colour).
2. **Make templates the front door.** Door, chest, NPC talk, shop, inn, enemy — each in two
   taps, each producing a normal editable object (scaffold, not black box).
3. **Kill numbered global state for beginners.** Offer named, scoped state ("this chest is
   open") by default; surface global flags only in an expert panel, and show *who sets / who
   reads* each flag.
4. **Replace "last page wins" with named states.** Show states as labelled cards with a plain
   sentence for each condition, and preview which state is active.
5. **Reduce triggers to what a child can say aloud**: "when tapped", "when stepped on",
   "starts by itself once". Hide the rest. Guard against the infinite-autorun freeze.
6. **No hidden layer rules.** Autotile and auto-layer by default; if layers exist, each has
   a name and a purpose; never ship stacking exceptions that need a manual page.
7. **Import images without slot geometry.** Auto-slice, tag roles (floor/wall/object),
   mark passability on a visual overlay rather than per-tile flag forms.
8. **Build a character maker with Randomise and one recipe → all views.** It is the emotional
   hook and removes the biggest art barrier.
9. **Touch-first parity**: no right-click, no hover, no keyboard modifiers needed (use
   long-press and two-finger gestures; the modifier-key autotile override needs a toggle).
   One-level inline editors instead of stacks of modals.
10. **Instant, safe loop**: one-tap play from the current position, deep undo with a history
    strip, autosave of the project; start with a tutorial that is itself a game; offer sample
    maps and "where is this used?" search from day one.

---

### Caveats

- Details of MV's helper apps were not inspected beyond folder names and changelog.
- 2003 numbers (resolution, tile size, save slots, sideview) and RGSS-era format notes
  are from general knowledge; the 2003 manual excerpts I read confirm only: pen/rectangle/oval/fill
  tools, 3-step undo, lower/upper tile types with autotiled sea and terrain, page and
  condition system, an ATB "wait" toggle command, and a resource manager.
- Insert-dialog layout is taken from the MZ command index page (three tabs); beginners'
  confusion list combines manual rules with commonly reported community experience
  **(unverified)** where not tied to a manual statement.
