# UI redesign — PixelRPG Maker

> Status: proposal, revision 2 (2026-11-14), answers [`BRIEF.md`](BRIEF.md). Nothing here is built.
> Baseline: `main` @ `68c667cc`, screenshots in `baseline/{desktop,tablet,phone}/`, recaptured on
> `games/zelda-like` (3 maps, 16 px tiles).

**Revision 2 — what changed and why.** Revision 1 was written against the `oot2d-2014` sample,
which rendered wrongly and has been deleted together with `minimalist-starter`. Every
observation in §1 is re-derived from the recaptured screenshots.

- **Dropped (oot2d artefacts):** 19-map atlas density and the titles it cut off, raw tileset
  ids on Graphics cards, the 1284-tile set, the 8 px-tile palette risk.
- **Dropped bug:** the clipped Character detail at 768 px no longer reproduces (`tablet/03`
  fits). Old step 0.4 is gone.
- **Corrected:** the atlas *already* draws teleports as dashed arcs with name pills. §6.2 and
  step 5.6 now restyle that renderer instead of adding one; the legend chip is removed because
  the lines explain themselves, not because nothing is drawn.
- **New findings:** the editor opens with 80 px of backdrop left of the map at every width, and
  a Live Run shows backdrop behind Stop (new step 0.4); the close button is missing on more
  screens than revision 1 listed (step 0.1 widened); atlas cards show a section of the map, a
  title clipped to the card ("Link'…") and an unexplained "★ 303" (§4.2, steps 0.7, 0.9, 5.3).
- **Welcome:** the bundle holds two templates, Blank and Kokiri Forest. Ordering, captions and
  the removed filter entry follow from that (§4.1).
- **Starter tiles became a prerequisite.** With `minimalist-starter` gone the bundle has no
  tileset a new project may use: `blank-starter` has none and the `zelda-like` art is
  Nintendo-derived under a non-commercial licence. §6.5 and the plan (task H1, steps 0.8, 3.6)
  pull the first pack forward. Risks 8–11 in §10 are new.
- **Atlas sizing:** the sample pairs a 176×148 map with an 11×11 room, so cards get a minimum
  size, titles sit outside the card, and List mode moves into "⋯" (§4.2).

This spec redesigns and completes the Maker UI as one adaptive libadwaita app. It keeps every
constraint recorded in [`responsive-chrome.md`](../../concepts/responsive-chrome.md): the canvas
is never reparented, no `Gtk.WindowHandle` spans paintable map, every floating piece is its own
`Gtk.Overlay` child, undo is reachable at every width, the armed tool is always nameable, and an
`Adw.BreakpointBin` writes one property because it applies one breakpoint.

Markers used below: **NEW** (does not exist), **CHANGED** (exists, reshaped), **REMOVED**.

Contents: [1 Critique](#1-what-the-baseline-shows) · [2 Principles](#2-design-principles) ·
[3 Navigation](#3-navigation-model) · [4 Screens](#4-screens) ·
[5 Map editor on phone](#5-map-editor-on-phone-in-depth) · [6 Completing the app](#6-completing-the-app) ·
[7 Visual language](#7-visual-language) · [8 Collab-readiness](#8-collab-readiness-of-new-mutations) ·
[9 Plan](#9-phased-implementation-plan) · [10 Open risks](#10-open-risks-to-verify-first)

---

## 1. What the baseline shows

Concrete findings, by screenshot (`zelda-like`: Kokiri Forest 176×148, Link's Tree House
21×15, a cozy variant 11×11). Each one is resolved by a section below.

**Navigation and shell**

- `phone/09`, `tablet/09`, `desktop/09`: three destinations cost a 260 px drawer with a logo, a
  title, a subtitle and an orphaned "Settings" text label at the bottom. On phone the drawer is
  the *only* way to change destination, it opens from a 16 px icon in the top-left corner (the
  hardest thumb position), and it covers 65 % of the map to show three rows.
- **No close button** on most screens. Pointer users cannot close the window from Welcome
  (`desktop/01`, `tablet/01`), the atlas (`*/02`), Game (`*/06`), the map editor with the
  inspector closed (`desktop/07`, `tablet/07`) or Things on phone (`phone/04`). It exists only
  where a content header happens to carry it (`desktop/03`–`05`, `phone/01`, `phone/03`).
- `desktop/07`, `phone/07`: the map editor never says which map is open. "‹ World" names where
  back goes, not where you are — and two of the sample's three maps are tree houses.
- `phone/03`: two stacked headers (chip switcher row, then "‹ Scientist" row) spend 90 px
  before any content.
- `tablet/08`: with the inspector open the six tools leave the pill entirely; only the badge
  is left to say and change what is armed.

**Welcome**

- `desktop/01`: seven of eight recent rows are "Missing — file not found", two of them for the
  deleted "OoT2D 2014 World". The dead rows are the dominant content of the screen, and six
  rows share the name "Pixel RPG Adventure". The sidebar toggle floats alone at the top right
  of the content. "Join session by code or link" carries a pencil and an arrow with no visible
  meaning.
- `desktop/01`: two template cards. The first is a grey rectangle ("Blank Project"); the
  weakest card has the strongest position. The second shows Kokiri Forest as a ~100 px
  miniature on a 310 px green slab and is captioned "Zelda-like demo (full art)" — a developer
  note. A "Filter templates…" entry searches two cards. The card says "Kokiri Forest"; the
  project it opens is called "Pixel RPG Adventure".
- `desktop/01`: the window says "Pixel RPG Editor", the product is "PixelRPG Maker". The
  tagline ends in "script events", which is not a child's word.
- `phone/01`: templates are pushed below the recents; a first-time user on a phone sees two
  buttons and a list of broken projects.
- `desktop/01`: "AI assistant is now editing with you" appears on a screen with no project open.

**World (atlas)**

- `desktop/02`: connections **are** drawn: a dashed accent arc per teleport with a pill at its
  midpoint that names the destination, plus a "Teleport" legend chip. With three maps the pills
  already collide ("Kokiri Forest" sits on "Link's Tree House", an arc strikes through the
  text). A door and its way back draw two arcs. Every arc meets Kokiri Forest in one dot, so
  the endpoint does not mark a door.
- `desktop/02`: a card is a *section* of its map, not the map: the 176×148 forest shows three
  trees. Cards are not to scale with each other (2 px per tile against 8 px). The 11×11 room's
  title is clipped to its 88 px card ("Link'…"), so the two tree houses cannot be told apart.
  "★ 303" and "★ 2" explain nothing.
- `desktop/02`: the minimap is shown although the whole world fits the window, and it sits
  under the inspector toggle. A translucent 46 px strip spans the top to hold two 16 px icons.
- `tablet/02`: at 200 % both tree houses are cut by the right edge; the toast covers the
  legend chip.
- `phone/02`: at 200 % a phone shows part of one map. Its name is scrolled off; a bare
  "176×148" floats above it. Two arcs labelled "Kokiri Forest" lead off-screen to cards that
  cannot be seen. The minimap sits under both toggle buttons. "New map" does nothing.

**Library**

- `desktop/03`: the list pane holds two 110×210 cards, a filter chip row, four dashed "Add
  from template" buttons and the header "+" — three ways to add, plus a bare trash icon on
  every row. The detail repeats "Appearance: Scientist" three times (stat card, row, "Edit
  appearance"). "Hero · spawns at the map's player spawn-point" is jargon. "Place on map", the
  most useful action, is a grey pill.
- `tablet/03`: the detail fits at 768 px (revision 1 reported clipping; it is gone). The
  subtitle wraps to three lines beside the name.
- `desktop/04`, `phone/04`: Things lists "Heroes › Scientist, Link · Character" and nothing
  else. Things shows Characters, has no empty state, and on phone has no add button and a
  clipped "Chara" badge.
- `desktop/05`, `tablet/05`: a permanent "No selection" pane takes 320 px on desktop and 260 px
  (34 %) on tablet. Tileset thumbnails are a top-left crop with a grid drawn over it. The page
  explains itself three times in grey paragraphs. Cards carry display names now ("Tree House
  Interior"); the palette header still shows the raw id (`desktop/08`: "lokiri-forest").

**Game**

- `desktop/06`: one 576 px column in a 1280 px window. "Settings saved into game-project.json"
  shows a filename to a child. Three disabled "Always on" rows take as much room as the one
  thing the user can change. No start map, no hero, no Play, no export.

**Map editor**

- `desktop/07`, `tablet/07`, `phone/07`: an 80 px light-grey strip runs down the left of the
  canvas at all three widths. It is not a layout slot: the colour is the engine's backdrop
  clear colour, it moves with the camera (gone in `desktop/08`, `*/11`), and the offset is the
  same 80 px at 400, 768 and 1280 px. The editor **opens with the camera 80 px left of the
  map's first column**. On desktop it reads as a broken sidebar; on phone it wastes 20 % of
  the width. This is a bug in the opening camera (step 0.4).
- `desktop/08`: the inspector's tabs are "Tiles · Layers · Objects · Props" — "Props" is jargon
  and "Objects" contradicts the UI word *Things*. The tabs sit at the bottom of a desktop pane.
- `desktop/08`, `phone/08`: the palette draws tiles as separate 48 px swatches with gaps. The
  forest's trees, cliffs and huts span 2–6 tiles and arrive as fragments with blank holes
  between them. "Search tiles…" takes the best row for a set of 1024 unnamed tiles.
- `phone/08`: the inspector drawer leaves an 80 px map sliver; the phone bar shows through
  under it.
- `phone/07`: the four tool icons carry no words and Select is drawn as "▸ ◂". Undo sits in the
  top-right corner, the far end of the thumb's reach. The sheet's only affordance is a 16 px
  chevron. The brush badge's green ring reads as "online".
- `desktop/11`: a Live Run changes only the FAB to "Stop". Nothing else says the game is
  running, and there is no Restart on wide. A near-white 72×88 px block shows behind Stop: the
  run camera looks past the map's corner. The hero is about 20 px tall in a 1280 px window.
- `phone/11`: the run is clean and unplayable — no touch controls.
- `desktop/10`, `phone/10`: Full view adds an empty dark capsule bottom-left (the cursor
  caption with no text) and a second chevron button beside Play.

---

## 2. Design principles

1. **The map is the app.** Every screen that shows a map gives it the whole window. Chrome
   floats, docks at the bottom on phone, or goes away. A control earns standing pixels only if
   it is used during a stroke; everything else is transient or one tap away.
2. **Thumbs first on phone.** Everything used while editing lives in the bottom 40 % of the
   screen: tools, tiles, undo, play, selection actions. The top edge holds only what is used
   between tasks (back, people, menu).
3. **One word, one place, one implementation.** A concept has one name (the UI words table),
   one home in the navigation, and one widget that moves between hosts — the way `BrushPage`
   already moves between a popover and the sheet.
4. **Child path by default, expert path by acceleration.** The default flow is visible, named
   and forgiving (undo everywhere, no confirmation where undo exists). Experts get the same
   actions faster: keyboard, drag, Full view. Full view adds rows; it never moves things.
5. **Show, don't configure.** Pictures over forms: plane chips, collision pictograms, map
   connection lines, template cards with live previews.
6. **Nothing dead.** No disabled furniture, no placeholder button, no pane that says "No
   selection". If a surface has nothing to show it is not on screen.
7. **Native.** Only libadwaita and GTK widgets, Adwaita style classes and CSS variables, the
   system accent colour, light and dark.

---

## 3. Navigation model

### 3.1 Structure

```
Welcome                                   (no project)
└─ Project shell                          three top-level destinations
   ├─ World      atlas (map view | list)
   │   └─ Map editor                      immersive level, entered from World
   ├─ Library    Characters · Things · Graphics  →  detail
   └─ Game       home: play, start, rules, about, checkup
```

**CHANGED** — the map editor is no longer a peer that shares a rail with World. It is a level
*inside* World: the shell's navigation is hidden while a map is open, and "back" returns to the
atlas centred on that map.

**REMOVED** — the `ModeRail` drawer, at every width. Three static destinations are a view
switcher in the HIG, not a sidebar. That deletes `show-library` / `library-collapsed`, the left
`Adw.OverlaySplitView` on every view, `win.toggle-library` and the tablet breakpoint's only
setter. The brief suggests a desktop sidebar; this spec deliberately does not use one, because
it would take ~200 px from the atlas to show three rows.

### 3.2 Widgets

```
Adw.ToastOverlay
└─ Gtk.Stack root_stack            (crossfade; hhomogeneous/vhomogeneous: false)
   ├─ "welcome"   WelcomeView
   ├─ "shell"     Adw.ToolbarView shell
   │     [bottom] Adw.ViewSwitcherBar   stack: shell_stack; reveal: bind compact
   │     content: Adw.ViewStack shell_stack
   │        ├─ "world"    AtlasView       icon map-symbolic
   │        ├─ "library"  LibraryView     icon library-symbolic
   │        └─ "game"     GameView        icon applications-games-symbolic
   └─ "map"       SceneEditorView   (child of root_stack for the app's life — never reparented)
```

- The scene editor stays a permanent child of a stack, as today, so the engine's
  `vfunc_unroot` teardown rule holds.
- `Adw.ViewSwitcherBar` and the wide `Adw.ViewSwitcher` bind to the same `shell_stack`. This is
  libadwaita's standard adaptive pair and gives keyboard and screen-reader navigation for free.
- `check-mode-routes.mjs` keeps its job; `VIEW_FOR_MODE` gains the two-level route
  (`world` → `shell/world`, map editor → `map`). Update the MCP bridge's `set_view` enum in the
  same commit.

### 3.3 Per tier

Tiers keep today's thresholds (fix the double match at exactly 768 sp: phone is
`max-width: 767sp`).

| | Phone `< 768sp` | Tablet `768–1023sp` | Desktop `≥ 1024sp` |
|---|---|---|---|
| World / Library / Game | `Adw.ViewSwitcherBar` at the bottom | `Adw.ViewSwitcher` top centre | same as tablet |
| …on Library, Game | bottom bar; `Adw.HeaderBar` shows page title | switcher is the header's title widget | same |
| …on World (canvas) | bottom bar | switcher inside a top-centre OSD pill | same |
| Map editor | no shell nav; bottom tool bar + sheet | no shell nav; pills | no shell nav; pills + inspector |
| Library chips | `Adw.InlineViewSwitcher` under the header | top of the list pane | top of the list pane |
| Detail pages | pushed (`Adw.NavigationView`) | split (`Adw.NavigationSplitView`) | split |
| Primary menu, people | header end / top-right OSD pill | same | same, plus `Gtk.WindowControls` |

The top-centre position is the same on every wide screen, canvas or content, so the three
destinations never move.

### 3.4 Back, swipe, deep links

- **Back** = header/OSD back button, `Esc`, `Alt+←`, mouse back button, and the shell's back
  gesture. Order of what one "back" undoes:
  1. Live Run running → Stop.
  2. Sheet at half/full → collapse to peek.
  3. Selection → clear.
  4. Pushed page → pop.
  5. Map editor → World, with the atlas centred and zoomed on the map just left.
- **Two actions, on purpose.** The gestures above all bind `win.back`, which runs that order
  through the pure `resolveBackStep()`. The editor's *visible* back button — the "‹" circle on
  phone and the arrow in the editing pill — binds `win.back-to-atlas` instead: the
  unconditional "leave this map", with no steps in front of it. That is deliberate, not a
  leftover. A button a finger can see has to do the thing it is labelled with, the way iOS and
  Android treat a navigation-bar back: if the first tap instead collapsed a sheet the person
  can see is open, the control would read as broken. The invisible paths — `Esc`, `Alt+←`,
  mouse button 8, the shell's back gesture — are where a *contextual* back belongs, because
  there is no label to contradict. The MCP bridge's `back_to_atlas` tool and
  `scripts/smoke/drive.py` bind the unconditional action for the same reason: they want to
  leave, not to unwind.
  Re-check once 3.3 lands and a selection has a visible bar of its own: a tap on "‹" with the
  sheet at Full now skips three rungs of state at once, and if that reads as losing work on a
  real phone, the fix is for the button to adopt `win.back` and for Peek to become the only
  resting detent — not to make `resolveBackStep` conditional per caller.
- **Swipe-back** is on for every `Adw.NavigationView` (Library and Game details, sheet
  sub-pages). It is *not* an edge swipe on a canvas: an edge drag on the map is a stroke.
- **Tabs keep their place.** Switching World → Library → World returns to the same scroll,
  zoom and pushed page. `Adw.ViewStack` keeps pages alive; do not reset on switch.
- **Deep links** are the existing actions; each builds the back stack it implies, so back from
  a deep-linked detail goes to its gallery, never to "nowhere":

| Action | Lands on | Back goes to |
|---|---|---|
| `win.open-scene(mapId)` | Map editor | World, centred on the map |
| `win.focus-placement(mapId, placementId)` **NEW** | Map editor, placement selected, camera on it | World |
| `win.open-character(id)` / `win.open-object(id)` | Library detail | that chip's gallery |
| `win.open-tileset(id)` / `win.open-appearance(id)` | Graphics detail | Graphics gallery |
| `win.edit-appearance(id)` | Character detail, Animations section | Characters gallery |
| `win.mode(x)`, `win.library-chip(x)` | top-level page | — |
| `win.sheet-page(brush\|layers\|selected)` **NEW** (replaces `win.set-inspector-tab`) | editor sheet / inspector page | collapses |
| `pixelrpg://join/<code>` **NEW** | Together dialog, code filled | closes dialog |

---

## 4. Screens

### 4.1 Welcome

**Layout, all tiers:** one scrolling column in an `Adw.Clamp` (max 720). No sidebar, no toggle.

1. **Continue** — only when a recent project exists: one large card with the start map's live
   preview (`MapPreview`), project name, "Continue" (`suggested-action pill`). On phone this is
   the first thing under the title and sits in the thumb zone.
2. **Start something new** — one card per bundled template, in an `Adw.WrapBox`: side by side
   from 560 px, stacked below. The bundle holds two, so there is no heading with a filter
   entry and no gallery chrome; the section is two large cards and a flat "Open a game from a
   file…" button under them.
   - Each template declares `kind` (`example` | `starter`) and a one-line child `caption` in
     its `package.json`; the card shows those instead of a developer note.
   - **Kokiri Forest** (`example`): caption "An example game — look around and change it".
     The preview fills the card: crop around the hero's start at a whole-pixel scale, not the
     whole map letterboxed on a colour slab.
   - **Blank** (`starter`): a dashed outline card with a "+", title "Empty game", caption
     "Start from nothing".
   - **Order.** Today the example comes first: Blank has no tiles to paint with (§6.5), so
     putting it first sends a child into an empty palette. When the first starter pack ships,
     Blank becomes "New game" (it opens the New-map dialog of §6.1, which fills the first map
     from a pack), gets the caption "Good first game" and moves to the front.
3. **Recent** — at most four rows. Missing projects are not listed; one
   `Adw.ButtonRow` "7 games could not be found — Tidy up" removes them. Two recents with the
   same name show their folder as the caption instead of the description.
4. **Play together** — nearby sessions as rows (hidden when none; no "No sessions found" row)
   and one `Adw.ButtonRow` "Join with a code…" that opens an `Adw.Dialog` with an entry.

| | |
|---|---|
| CHANGED | Title "PixelRPG Maker"; tagline "Draw maps, add heroes and doors, press Play." |
| CHANGED | Recents move from a 380 px sidebar into the column; missing rows collapse |
| CHANGED | The example project is named after its card ("Kokiri Forest"), not "Pixel RPG Adventure" (content fix in `games/zelda-like`) |
| REMOVED | `OverlaySplitView` + sidebar toggle; "Browse all…" (the dialog stays in the primary menu); the template filter entry (it returns at seven templates) |
| REMOVED | The AI-collaborator toast outside a project |
| NEW | Continue card; "Tidy up" row; join-by-code dialog; template `kind` + `caption` |

**Loading** — opening a project switches to the shell at once and shows an `Adw.Spinner`
(48 px) with the project name centred in the World page until maps are ready. No toast.

### 4.2 World (atlas)

A true pan/zoom surface that opens at **Fit** (all maps visible), remembers its camera per
project, and shows each map whole with its connections.

**Chrome**

| Piece | Phone | Tablet / desktop |
|---|---|---|
| Destinations | bottom `Adw.ViewSwitcherBar` | top-centre OSD pill with `Adw.ViewSwitcher` |
| Context pill (top right, OSD) | roster chip · "⋯" | roster chip · "⋯" · `Gtk.WindowControls` |
| Map / List | in "⋯" | in "⋯" (`Ctrl+L`) |
| Zoom | pinch; "Fit" is a 44 px circular OSD button bottom-left | `−  74 %  +  Fit` OSD cluster bottom-left; the minimap joins it only while the world is larger than the window |
| New map | FAB (icon + label ≥ 400 px, icon only below) bottom-right, above the nav bar | FAB bottom-right |
| Selection | contextual bar replaces the nav bar | contextual OSD bar bottom-centre |

**Cards**

- **CHANGED** — a card is the **whole map**, scaled by the atlas zoom. Looking closer is
  zooming the atlas. The per-card viewport section and its lock toggle are removed; this
  reverses the shipped "Viewport scene-card previews" and needs a yes from the owner (§10).
- **Minimum size.** A card never draws below 64 px on its short side (72 px on phone). At Fit
  on a phone the forest is about 170 px wide and the 11×11 room would be 40 px; it draws at
  the minimum instead. Cards are therefore to scale down to that floor, not below it.
- **Title outside the card.** The name is a label above the card, centred on it, up to 200 px
  wide and independent of the card's width, so an 88 px card can carry "Link's Tree House
  (cozy)". The title belongs to the card's allocation: dragging and auto-placement keep titles
  from overlapping. The "176×148" size leaves the title line for the selection bar and the
  list.
- **REMOVED** — the "★ 303" count badge. Full view shows "303 things" in the selection bar.
- The start map carries a small flag badge beside its title.

**Interaction**

- Tap / click a card → select. The card gets a 3 px accent ring and the **selection bar**
  appears: `Kokiri Forest · 176×148 · 2 doors   [Open]   [⋯]`. "Open" is the suggested action.
  Double-click, `Enter`, or a second tap on the selected card also opens.
- Drag a card → move it (pointer). On touch a drag pans; long-press lifts the card (scale
  1.04 + shadow) and then it follows the finger. This keeps the drag-began / selected split from
  the auto-open policy.
- "⋯" on the bar or long-press / right-click on a card → `Gtk.PopoverMenu`: Rename, Duplicate,
  Map settings…, Start the game here, Delete.
- **List mode** — "Show as list" in "⋯" swaps the surface for a `Gtk.ListView` of maps
  (56 px thumbnail, name, size, door count, peers present). It is the keyboard- and
  screen-reader-first path. With the sample's three maps it is not worth a standing control;
  it earns one in the context pill if projects with dozens of maps become common.

| | |
|---|---|
| CHANGED | Opens at Fit; real zoom (cards allocated at scaled coordinates); zoom persisted in `editorData` |
| CHANGED | Whole-map cards with a minimum size; titles above the card |
| CHANGED | Connection arcs restyled and made interactive (§6.2) |
| NEW | Selection bar, list mode, start-map badge, peer dots on cards |
| NEW | New-map flow (§6.1) |
| REMOVED | The translucent top strip; the `SceneInspector` side pane (its content is the selection bar plus the "Map settings…" dialog); the "Teleport" legend chip; the per-card section + lock toggle; the "★" badge |
| REMOVED | Minimap on phone (Fit and List cover it), and on wide whenever everything fits |

### 4.3 Map editor

One editor, two layouts (as today): **wide** (pills + optional right inspector) and **phone**
(top corners + bottom bar + sheet). §5 covers phone in depth.

**Wide layout**

```
editing pill (top-left)                                   context pill (top-right)
[‹] [Kokiri Forest ▾] | [↶][↷] | [Select Paint Fill Erase Pick Thing] | [▣ Paint · Ground]      [●●] [⋯] [▯] [– □ ×]
```

- **CHANGED** — the back arrow is followed by the **map name** as a flat button. It opens a
  popover listing every map (thumbnail + name) for a direct jump; the first row is "World".
  The ladder's `normal-1` rung shows the name instead of the word "World".
- **CHANGED** — the tool called "Object" is **Thing**. Its popover is the Things half of the
  Brush page.
- **CHANGED** — right inspector pages are **Brush · Layers · Selected**, switched by an
  `Adw.InlineViewSwitcher` at the *top* of the pane. They are the same three widgets the phone
  sheet shows. "Tiles", "Objects" and "Props" disappear as names.
- **CHANGED** — `Gtk.WindowControls` join the end of the context pill, so close exists with the
  inspector shut. Inside a pill they need no `WindowHandle` of their own.
- **CHANGED** — **opening camera.** A map opens where it was left (per map, in `editorData`);
  the first time it centres on the hero's start if this is the start map, else on the map's
  centre. At rest the camera is clamped to the map: backdrop shows only when the map is
  smaller than the window (then the map is centred) or while rubber-banding. The clamp is
  loosened by the chrome's insets, so a corner tile can still be panned out from under a pill
  or the phone bar. This removes the 80 px strip of `*/07`.
- **CHANGED** — Play is an `Adw.SplitButton` FAB: main = Play here; menu = Play from the start,
  Open the game in its own window.
- **NEW** — run state on wide: while running, the canvas gets a 3 px inset accent border, the
  context pill gains Restart, and the tool group dims to 60 % unless the pointer is over it.
  "Test run" (no editing) hides the editing pill exactly as the phone layout already does.
- **REMOVED** — the empty cursor-caption capsule (render it only when it has text) and the
  second chevron beside Play.

**View menu ("⋯")** — Zoom in / out / fit, Show grid, Dim other layers, Show Things (the
Objects eye moves here from the Layers page), Show walls **NEW**, Map settings…, Keyboard
shortcuts, then the app section (Simple/Full view, Preferences, About).

### 4.4 Library

One pattern for all three chips: **gallery → detail**.

- **Phone:** header (`Adw.HeaderBar`, title "Library"), `Adw.InlineViewSwitcher` Characters ·
  Things (· Graphics in Full view), a two-column card grid (`CardGallery`), and a FAB
  ("New character" / "New thing" / "Add graphics") above the bottom nav. Tapping a card pushes
  the detail; the detail's header replaces the Library header (one header, not two).
- **Tablet / desktop:** `Adw.NavigationSplitView`. Sidebar 300 px: chip switcher, search
  (appears on typing or `Ctrl+F`), a compact list — 56 px rows with a 40 px nearest-neighbour
  thumbnail, name, group caption — and a "New …" `Adw.ButtonRow` pinned at the bottom. Content:
  the detail in an `Adw.Clamp` (max 640). The first entry is selected on arrival, so there is
  never a "No selection" pane.

**Ownership** (resolves the blur between the chips and Game):

| Place | Owns | Does not show |
|---|---|---|
| Characters | everything that has a body and can move: Heroes, People, Enemies (group appears when a combat system is on) | — |
| Things | everything a hero finds or touches: Doors, Chests, Signs, Items, Switches; Full view adds Triggers | Characters — **REMOVED** from this list |
| Graphics (Full view) | pictures: tilesets and appearances; tile walls and surfaces | animation authoring (stays on the character) |
| Game | identity, start, rules | library content |

A game system that is switched on adds templates and groups to the Library; the Game page says
so on the system's row ("Adds: Enemies, Hearts").

**Detail page** (generated; works for any component set)

```
[preview 128–180]   Name (inline Adw.EntryRow on tap)        badge: Hero
[◀ ▲ ▼ ▶  ⏸]        [ Place on map ]  suggested-action pill   [⋯]

Basics            name · role · player switch
Looks             appearance picker row (thumbnail) · Edit animations ›
<component>       one Adw.PreferencesGroup per component, title = child name of the component
…
[ + Add an ability ]   Adw.ButtonRow → Adw.Dialog listing what the enabled systems offer
Show 4 more settings   existing disclosure row, at the end of the group it belongs to
```

- **REMOVED** — the four stat cards (they duplicate rows), the row trash icon (Delete moves to
  the detail's "⋯" and the list's context menu, and is undoable by toast), the dashed "Add from
  template" buttons (templates are the first page of the "New …" dialog), filter chips when a
  chip has fewer than eight entries.
- **CHANGED** — "Place on map" is the primary action. If a map was open in this session it
  returns there with the Thing brush armed; otherwise it opens a map picker first.
- **Field → row mapping** for generated inspectors: boolean → `Adw.SwitchRow`; number →
  `Adw.SpinRow`; enum ≤ 4 → `Adw.ToggleGroup` in an `Adw.ActionRow`; enum > 4 → `Adw.ComboRow`;
  text → `Adw.EntryRow`; reference (map, thing, appearance, tile) → `Adw.ActionRow` with a
  thumbnail suffix that pushes a picker page; list → nested group with an `Adw.ButtonRow` to
  add. A component in Full view gets a header suffix menu (Remove, Reset).
- **Dormant components** render as a dimmed group with one row: "Switched off in Game › Rules"
  and a "Turn on" button.
- **Graphics detail** — the tileset drawn as its **sheet**, contiguous, pinch/scroll zoomable;
  selecting tiles opens the tile properties (§6.4) in the split's own `Adw.BottomSheet` on phone
  and in a 300 px `Adw.OverlaySplitView` end pane on wide. Cards show the whole sheet scaled to
  fit (§7 for the filter), never a cropped corner with a grid. The display name the cards
  already show is used everywhere a tileset is named, including the palette header and chips.

### 4.5 Game

A **home page for the game**, not a settings column.

1. **Title card** — cover = start map preview, name (inline edit), "Play from the start"
   (`suggested-action pill`), "Share…" (opens Together), in Full view "Export…".
2. **Checkup** — an `Adw.PreferencesGroup` that lists what stops the game from working, each
   row a deep link: "No hero yet → Characters", "A door in Kokiri Forest goes nowhere →
   `win.focus-placement`", "No start map → pick one", and as a hint "No door leads to Link's
   Tree House (cozy)" (true of the sample today). When clean it is a single row,
   "Ready to play". This is the validator's output with a face.
3. **Start** — Start map (picker with thumbnails), Hero (character picker).
4. **Rules** — one `Adw.ExpanderRow` per optional game system: icon, child sentence, switch as
   suffix, settings inside, "Adds: …" caption. Switching one off with data in use shows an
   `Adw.AlertDialog` that states the data is kept and counts what goes quiet.
5. **About** — author, description. Full view adds tile size and "Show game folder".

- **REMOVED** — the "Always on" group in Simple view (Full view shows it as one collapsed
  "Built in" expander); "Settings saved into game-project.json".
- **Layout:** phone and tablet one column (`Adw.PreferencesPage`). Desktop ≥ 1100 px uses an
  `Adw.MultiLayoutView` with two `Adw.LayoutSlot`s: title card + checkup pinned left (360 px),
  the groups scrolling right. No GL child lives here, so re-slotting is safe.

### 4.6 Play mode

| | Phone | Tablet / desktop |
|---|---|---|
| Live Run chrome | bar, FAB, back and undo hide; context pill = Stop · Restart; touch controls appear (§5.6) | accent border; FAB = Stop; Restart in the context pill; tools stay |
| Test run | same as Live Run (phone has no edit-while-playing) | editing pill and inspector hide |
| Full Run | "Play from the start" on the Game page; own window on desktop, full-screen page on phone | own window |
| Dialogue, items | in-game overlays drawn by the engine, not toasts (out of scope here; TODO "Real runtime effect systems") | same |
| Leaving | Stop, `Esc`, back | same |

On entering a run the camera snaps to the hero before the first frame, and the map name in the
pill follows a teleport. The run camera is clamped to the map like the editor's, so no backdrop
shows behind Stop (`desktop/11`). A run started from "Play from the start" uses the largest
whole-pixel zoom that still shows at least 15 × 10 tiles; "Play here" keeps the editor's zoom,
because the point is to see the spot being edited. **Landed** (step 4.3) — with a doubt recorded
in TODO.md about the last clause: "Play here" started at 800% begins a tile and a half wide, and
the zoom it wants to keep is probably the wide *Live* Run's, which has no entry point yet.

### 4.7 Collaboration and presence

- **Roster chip** (context pill, every project screen): solo it is an "add person" icon
  button; with others it is up to three overlapping 24 px avatars in each peer's colour plus
  "+N". Phone shows one avatar with a count badge.
- **Together** — tapping the chip opens an `Adw.Dialog` (a bottom sheet on phone by itself):
  - *People* — one row per participant: colour dot, name, where they are ("Link's Tree House"),
    "Follow" toggle. The AI collaborator is a row like any other, with a Pause switch.
  - *Invite* — the session code in large monospace with Copy, "Visible to devices nearby"
    `Adw.SwitchRow`.
  - *Stop sharing* — `destructive-action` `Adw.ButtonRow`.
- **Presence on surfaces:** peer cursors and selections on the map (exists); peer dots on atlas
  cards and list rows **NEW**; a 6 px colour dot on a Library row someone is editing **NEW**;
  the AI's edits flash in its colour on every peer **NEW** (TODO "Surface AI op attribution").
- **Follow** — the camera tracks a peer; an OSD chip "Following Mia · Stop" sits top-centre.
  Any own pan or stroke ends it.
- **Connection state** — `Adw.Banner` at the top of content views, an OSD chip with an
  `Adw.Spinner` on canvas views: "Reconnecting…". Join and leave are toasts, only inside a
  project.
- A paused AI shows a desaturated avatar with a pause glyph.

### 4.8 Preferences

`Adw.PreferencesDialog`, one page, reached from the primary menu (the "Settings" label in the
old drawer is removed).

| Group | Rows |
|---|---|
| View | Full view `Adw.SwitchRow` ("Show every setting") |
| Editing | Show grid by default · Zoom snaps to whole pixels · Touch controls: Automatic / Always / Never (`Adw.ComboRow`) |
| Together | Your name (`Adw.EntryRow`) · Your colour (swatch row) · Visible to devices nearby · AI collaborator |
| Help | Show tips again (`Adw.ButtonRow`) |

No theme switch: the app follows the system style, per HIG. (If the `theme` key must stay, it
is one `Adw.ComboRow` in View.)

### 4.9 Empty states

All are `Adw.StatusPage` (`compact` on phone) with one primary action and never a paragraph.

| Where | Title | Action(s) |
|---|---|---|
| World, no maps | "Make your first map" | New map |
| Characters, none | "Who is in your game?" | New hero · New person |
| Things, none | "Things are what your hero finds" | `Adw.WrapBox` of template pills: Door · Chest · Sign · Item — one tap creates and opens it |
| Graphics, none | "No pictures yet" | Starter packs (§6.5, when one exists) · Import… |
| Sheet › Brush › Tiles, project has no tileset | "No tiles yet" | Starter packs (when one exists) · Import a picture… |
| Sheet › Selected, nothing selected | "Tap something on the map" | — (compact, no icon) |
| Sheet › Brush › Things, none | "No things yet" | New thing (deep link, returns here) |
| Search, no hits | "Nothing called "…"" | Clear search |
| Welcome, no recents | sections 1 and 3 are simply absent | — |
| Map picker, single map | "This is your only map" | New map |

### 4.10 First run and onboarding

No tour, no modal. Three **coach marks**, shown once, on the first map a user opens:

1. "Pick a tile" — points at the brush badge / recent strip (the target pulses once). In a
   project without a tileset it reads "Get some tiles first" and points at the Brush page's
   empty state.
2. "Draw on the map" — appears after a tile is picked; disappears on the first stroke.
3. "Press Play to try it" — points at the Play FAB after the first stroke.

Each is a small OSD card (`.osd`, 12 px radius, max 240 px) anchored beside its target as its
own overlay child with `can-target: false` except its close button. Progress is the user's own
actions; "Skip tips" ends all three. State lives in GSettings (`onboarding-step`).

Creating a project from a template opens its **start map in the editor**, not the atlas: the
first screen after "new game" is a map you can draw on. Back leads to World.

---

## 5. Map editor on phone, in depth

### 5.1 Zones

```
┌──────────────────────────┐
│ (‹ Kokiri…)     (●  ⋯)   │  top corners: between-task controls only
│                          │
│                          │
│         MAP              │  edge to edge; one finger = the armed tool
│                          │
│                          │
│ (↶ ↷)            (▶ Play)│  floating, 12 px above the bar: thumb zone
├────────── ▂▂ ────────────┤  drag handle
│ [✋][✏][▨][⌫]     [▣]    │  tools (44 px) · brush badge (48 px)
│ ▣ ▣ ▣ ▣ ▣ ▣              │  recent tiles  ⇄  selection actions
└──────────────────────────┘  = the sheet's PEEK
```

- **CHANGED** — **undo and redo move to the bottom-left**, a two-button OSD pill floating above
  the bar. Undo stays a visible button at all times (the invariant), now in thumb reach. The
  context pill top-right shrinks to roster · "⋯".
- **CHANGED** — the back circle gains the map name, ellipsised, max 160 px:
  `‹ Kokiri Forest`. It is one button; it is not a `WindowHandle`.
- **CHANGED** — the first tool is **Move** (hand icon; desktop "Select"): one finger pans, a
  tap selects. A map opens with Move armed on touch, so a first touch never paints by accident.
- Tools carry their names as captions under the icons when the bar has room (≥ 400 px), and as
  tooltips / accessible names always.
- The bar's top edge shows the `Adw.BottomSheet` drag handle (`show-drag-handle: true`), which
  replaces the 16 px chevron.

### 5.2 The sheet: three detents

`Adw.BottomSheet` has two states (bar / open) and sizes the sheet to its child's natural
height; it has **no detent API**. Detents are built on top:

| Detent | Height | Modal | Use |
|---|---|---|---|
| **Peek** | the bottom bar (~112 px) | — | painting |
| **Half** | 46 % of the window, min 320 px | `modal: false` — the map above stays paintable | pick a tile and keep drawing; glance at layers; read the selection |
| **Full** | window height − 56 px | `modal: true` (dim) | search, long forms, layer management, starter packs |

Implementation (landed, step 3.2): `sheet-detents.ts` owns the arithmetic as pure functions —
which height a detent is, which detent a release lands on, how far the camera has to duck — and
`SheetDetentController` owns one number, the sheet child's `height-request`, animated with an
`Adw.SpringAnimation`. Peek IS the closed sheet, so the controller drives
`Adw.BottomSheet.open` alongside the height and reconciles a `notify::open` it did not cause;
crossing Peek is applied instantly, because libadwaita already animates open ↔ closed. Moves
come from a `Gtk.GestureDrag` on our own full-width grabber strip (libadwaita's handle cannot be
reached from a template) and from scrolling past the top of the page's `Gtk.ScrolledWindow`,
which collapses one rung. A fling picks the next detent in its direction and never skips one; a
tap on the grabber cycles Peek → Half → Full → Peek.

Rules that keep the hard-won fixes intact:

- The canvas keeps its size at Half: only the bar docks (the existing `margin-bottom` bind to
  `bottom-bar-height`). The camera gets a **bottom inset** instead
  (`Engine.setViewportInset({ bottom })`), so the focused tile stays above the sheet without a
  GL resize per drag frame.
- Every sheet page wraps and ellipsises to fit 360 px, because the sheet's minimum is the bar's
  minimum (the shared homogeneous stack). `phone-chrome.probe.spec.ts` measures the new pages.
- The toast clearance class on the window follows the detent.

### 5.3 Sheet pages

The sheet's child is an `Adw.ToolbarView`: top = drag handle + `Adw.InlineViewSwitcher`
(Brush · Layers · Selected), content = an `Adw.ViewStack` of three pages. The same three page
widgets are the wide inspector's pages; `SceneEditor.setLayout` moves them, as it already
moves `BrushPage`.

**Brush** — what the next stroke lays.

```
[ Below ][ Hero height ][ Above ]        plane chips (Adw.ToggleGroup), as today
Ground ▾                                 active layer (tap → Layers page)
[ Tiles | Things ]                       Adw.ToggleGroup — Things is no longer under the palette
( Forest )( Water )( Tree House ) →       tileset chips, horizontal scroll, thumbnail + name
┌───────────────────────────────┐
│ tileset as a contiguous sheet │        no gaps; drag = pick a block (stamp); pinch to zoom
└───────────────────────────────┘
Starter packs  ▸                         §6.5, at the foot
```

- **CHANGED** — the palette draws the tileset as its sheet, at 3× (16 px tiles → 48 px
  targets), panning on both axes. The forest's trees and huts appear whole. A tap picks one
  tile; a drag picks a rectangle that becomes a **stamp** brush (**NEW**; needs engine support — until then the
  drag picks the first tile). Selected tiles get a 2 px accent ring.
- **DROPPED** (step 3.4) — "Search tiles…" was to show at Full detent for tilesets carrying
  tile names. No tileset carries them, and a sheet drawn as one texture cannot be filtered
  without cutting it back into swatches, so the row is not built. The tileset chips cover what
  the field was reached for. It returns with per-tile naming; see `TODO.md`.
- Choosing a Thing arms the Thing brush and collapses the sheet to Peek; the badge shows the
  thing's sprite.

**Layers** — §6.3.

**Selected** — the properties of the tapped placement (**NEW**; this is the missing second
page). Header: sprite, name, kind, "Edit in Library ›". Body: the generated component groups
for *this placement's overrides* (the command layer for update-by-replace is ready), then
`Adw.ButtonRow`s Duplicate and Delete. With nothing selected the switcher item is insensitive
and the page shows its empty state.

Implementation (landed, step 3.3): the page is a `Gtk.Stack` over an `Adw.StatusPage` empty
state and the placement form — an `Adw.EntryRow` with the sprite as its prefix and an apply
button, then read-only kind / position / "Edit in Library ›" rows, then the page's own
`EntityComponentsEditor` for the overrides, then Duplicate and Delete. The position row is kept
although the design does not list it: it is the only place the user can see which layer the
placement sits on, and the layer decides what the guard chain allows. Writes go through
`EditOperations.setPlacementOverrides`, so the page needs **no new command**. One deviation:
the switcher item **cannot** be made insensitive — `Adw.InlineViewSwitcher` rebuilds its toggles
from the `Adw.ViewStack` and honours only `AdwViewStackPage:visible` — so the page stays
reachable and the empty state carries the message. Tracked in `TODO.md`. The scene-metadata rows
the old Props pane carried (name, music, size, tile size, encounters, on-enter) were deleted
here rather than moved: step 5.4's Map settings dialog has to create them.

### 5.4 Selection: a contextual action bar

Tapping a placement with Move selects it and **swaps the bar's second row** (recent tiles) for
selection actions — no sheet opens, the map stays visible:

```
│ [✋][✏][▨][⌫]                 [▣] │
│ Chest ·  [Edit] [Copy] [Move] [🗑] │
```

- *Edit* opens the sheet at Half on Selected. *Move* arms a one-shot drag (or just drag the
  selected placement). *Delete* removes with an "Undo" toast, no dialog.
- Tapping empty map clears the selection and restores the recent strip.
- This replaces the phone's auto-opening inspector drawer; on phone the right
  `Adw.OverlaySplitView` is never used (**REMOVED** on phone, resolves `phone/08`).

Implementation (landed, step 3.3): row B of `phone_bar` is a `Gtk.Stack bar_row_b` crossfading
between a `recent` page (the recent-tile strip) and a `selection` page, driven by the single
entry point `SceneEditor.setPlacementSelected(name | null)` — a name shows the row, `null`
restores the strip, so "tapping empty map" needs no second code path. The four verbs are
`win.edit-placement` / `win.copy-placement` / `win.move-placement` / `win.delete-placement`;
Copy and Move are words rather than icons because Adwaita ships no symbolic for either. *Move*
is the one-shot **tap**, not the drag: arming writes `PendingPlacementMoveComponent` on the
editor session, the next select-tool tap is consumed as the target and answered by
`Engine.movePlacement` (which keeps the placement id, so the undoable
`PlaceObjectCommand` is a same-id replace), and a refused move says so in a toast. The drag half
waits on the drag router that stroke painting needs — see `TODO.md`. The auto-open suppression
lives in `SceneEditorView.revealForSelection()`, which declines while `inspector-collapsed`;
`docs/concepts/responsive-chrome.md` § "Right inspector — auto-open policy" is the project-wide
statement of that exception.

### 5.5 Gestures

| Gesture | Result | Notes |
|---|---|---|
| Tap | apply the armed tool to one tile; Move: select | |
| One-finger drag | stroke with the armed tool; Move: pan | a stroke commits as one command on release |
| Two-finger drag | pan | always, with any tool |
| Pinch | zoom about the pinch centre | `Gtk.GestureZoom` on the engine widget → `Engine.setCameraZoom`; on release the zoom springs to the nearest whole-pixel scale |
| Second finger lands during a stroke | the stroke is **cancelled**, not committed | nothing reaches the undo stack or peers |
| Long press (500 ms) on a tile, paint tools | pick that tile (eyedropper), then stay on Paint | the brush badge pops (scale 1 → 1.15 → 1) |
| Long press on a placement | select + context menu (`Gtk.PopoverMenu` at the finger) | Edit, Copy, Move, Delete; "Goes to… ›" for doors waits on the §6.2 picker |
| Long press on empty map, Move | start a marquee | Phase 4b selection |
| Two-finger tap | undo | a transient OSD names it: "Undid: Paint" |
| Three-finger tap | redo | |
| Double tap, Move | toggle Fit ↔ last zoom | not with paint tools: no double-tap delay on strokes |
| Swipe up on the bar | Peek → Half | |
| Back | per §3.4 | |

Pinch and two-finger pan are one `Gtk.GestureZoom` on the engine widget (`pinch-zoom.ts`); it
CLAIMS its sequences, and that claim is what cancels the single-contact pointer stream from
`@gjsify/event-bridge`. The multi-finger taps read the raw touch stream in the CAPTURE phase and
never stop an event (`multi-finger-tap.ts`), so they can only add a gesture, never swallow one —
and because the zoom gesture also begins for a two-finger tap, its whole-pixel spring asks
`twoFingerDidMove` first. The gesture taps are accelerators; the buttons remain the contract.

**Feedback through motion** (the stand-in for haptics): pressed buttons scale to 0.96; a pick
pops the badge; an undo or redo flashes the affected tiles for 150 ms; a blocked action (locked
layer) shakes the layer name in the badge 6 px twice and shows a toast with "Unlock".

### 5.6 Live Run touch controls

```
┌──────────────────────────┐
│                 (■  ↻)   │  Stop · Restart
│                          │
│          GAME            │
│                          │
│   ◯                      │
│  ( ● )            ( A )  │  joystick appears under the thumb · action button
└──────────────────────────┘
```

- **Joystick** — a floating stick: touching anywhere in the lower-left 55 % × 45 % of the
  canvas places the base (96 px) under the thumb; the knob (44 px) follows up to 40 px; release
  hides it after 300 ms. It emits a 4-way or 8-way intent according to the game's movement.
- **Action button** — 64 px circle, 24 px from the right and bottom edges, label "A". Each
  enabled game system may declare one more input action; a second button (e.g. attack) stacks
  56 px up and left of A. Two buttons is the cap in Simple view.
- Both are GTK overlay children (each its own child), translucent OSD at 70 % opacity. They
  feed the session's input as a second producer next to the keyboard — input plumbing, not
  chrome. **Landed** (step 4.1), with one correction: they write their own
  `TouchInputComponent`, which `InputSystem` merges into `InputSourceComponent`. Writing that
  component directly cannot work — `InputSystem` rewrites it from the keyboard every tick, so a
  second writer is erased inside the same frame.
- Shown when the last pointer event came from a touchscreen, at any width, **or** when the
  window is at the phone breakpoint — a narrow window is being held, and the touchscreen-only
  rule would leave a phone run unsteerable for any session that used a mouse first. Preferences
  can force them on or off (deferred, see `TODO.md`).
- In a phone run the finger is the joystick: painting is off, as today.

---

## 6. Completing the app

### 6.1 New map

FAB "New map" → `Adw.Dialog` (bottom sheet on phone), one page:

| Row | Widget | Default |
|---|---|---|
| Name | `Adw.EntryRow` | "Map 4" (next free number), selected for overtyping |
| Size | `Adw.ToggleGroup`: Small 20×14 · Medium 40×30 · Large 80×60 (captions "one screen", "a village", "a forest"); Full view adds Custom with two `Adw.SpinRow`s | Small |
| Tiles | horizontal strip of tileset cards: project tilesets, then starter packs, then an "Import…" card. The row is the only content when the project has neither | the last used tileset |
| Floor | six swatches from that tileset to fill the ground with; "Empty" first. Hidden until tiles carry ground tags (packs do; the sample's sets do not) | first ground-tagged tile, else Empty |

"Create" (suggested) writes the map, drops its card in the free space nearest the atlas
viewport centre, animates it in (scale 0.9 → 1, 200 ms) and opens it in the editor. Also
**NEW**: Rename (inline on the card title), Duplicate, Delete (`Adw.AlertDialog`, destructive,
names how many doors lead there), "Start the game here".

### 6.2 Connections between maps

**Making one (child path)** — place a Door from Things. The Selected page (or inspector) shows
a row **"Goes to"**:

1. Tap → a picker page lists the maps with thumbnails.
2. Choosing one opens that map in **pick mode**: an OSD banner "Tap where the hero arrives ·
   Cancel", all tools replaced by one tap.
3. The tap returns to the door. A switch "Add a door back" (on by default) places the return
   door on the target tile.

**Expert path (wide)** — on the atlas, a selected card shows door handles at its doors; drag a
handle onto another card to set the target, drop position = arrival tile.

**Seeing them (atlas)** — the renderer exists: one dashed accent arc per teleport, a dot at
each end, a destination pill at the midpoint and a legend chip (`desktop/02`). The redesign
keeps the arcs and the data path and changes what they say:

| Today | Redesign | Why |
|---|---|---|
| a door and its way back are two arcs | a pair is **one solid line** with a door glyph at both ends | half the lines; the common case looks calm |
| every arc is dashed | **dashed + arrowhead = one-way**; solid = two-way | line style carries the meaning (never colour alone) |
| a destination pill on every arc, always | no standing label. The name pill shows for a hovered or tapped line and for the lines of the selected card, placed at the far end beside the target | three pills already collide with three maps; the cards carry the names |
| all arcs meet a card in one dot | each end sits on the **door's tile** of the whole-map card; several doors to one map fan out | the line shows *where* the door is |
| an arc to an off-screen card just leaves | the line ends at the window edge in a chip "→ Link's Tree House"; tapping it pans there | `phone/02` |
| no broken state | a door with no target draws a short red stub with "!"; tapping opens the fix (step 1) | — |
| "Teleport" legend chip | removed | the lines are self-explaining; "teleport" is not a UI word |

With a card selected, its lines are at full opacity in the accent colour and all others at
35 %. Tapping a line opens a popover: "Kokiri Forest → Link's Tree House", *Go to door*,
*Remove*. Lines hide below 25 % zoom and return on selection. The list mode shows the same
data as a caption: "2 doors · 1 goes nowhere".

### 6.3 Layer management

The Layers page (sheet and inspector), grouped by the three planes as today:

```
ABOVE THE HERO
  ≡  👁  🔒  Treetops                 ⋯
AT HERO HEIGHT
  ≡  👁  🔓  Walls                    ⋯
BELOW THE HERO
  ≡  👁  🔓  Ground          ● active ⋯
  [ + Add a layer ]
```

- Tap a row → make it the active layer. The eye and lock are 44 px toggle buttons on phone.
- "⋯" (and long-press / right-click) → Rename, Duplicate, Move up, Move down, Move to plane ▸,
  Delete. Move up/down exist because drag-reorder is hard with a thumb in a scrolling sheet;
  drag still works.
- **DEFERRED** (step 3.5) — the `≡` handle in the mock. Reorder is a row-wide drag, as before;
  a fourth 44 px target does not fit beside eye, lock and "⋯" at the 360 px floor without
  rethinking the row's layout, so the handle waits for that rather than shipping as a glyph
  that is not a grip. See `TODO.md`.
- Rename swaps the title for an inline entry (`Adw.EntryRow` behaviour); `Enter` commits.
- Delete has no dialog: it is a command, so the toast "Deleted Treetops · Undo" is the
  safeguard. The last layer of a map cannot be deleted (the item is insensitive).
- "Add a layer" (`Adw.ButtonRow`) sits at the end of each plane section in Full view, and once
  at the bottom in Simple view (adds to the active plane).
- **REMOVED** from this page: the Things visibility row (now "Show Things" in the view menu).
- The hover ghost takes the active plane's colour.

### 6.4 Collision editing

In Library › Graphics › a tileset, and from "Show walls" in the editor.

**Simple view — walls by picture.** Select one or many tiles on the sheet; the tile panel
shows **"Can the hero walk here?"** as a grid of pictogram toggles (an `Adw.ToggleGroup` in an
`Adw.WrapBox`): Free · Wall · Half (top, bottom, left, right) · Corner (four). Each writes a
ready-made `colliders[]` shape. A second control, **Wall brush**, turns a drag across the sheet
into "mark these as Wall / Free" — the fast path for a 1024-tile set.

**Full view — custom shape.** "Draw a shape…" opens an `Adw.Dialog` with the tile magnified
(snapshot widget, nearest-neighbour, at least 16× on phone), a snap grid of the tile's own
pixels, tools Rectangle · Polygon · Circle, a shape list with delete, and a live "hero bumps
here" preview. Pinch zooms the tile on touch.

**Seeing walls.** "Show walls" (view menu, and a toggle on the tileset sheet) hatches every
solid shape in `--error-color` at 40 % over the sheet, the palette and the map. Checkup lists
"No walls anywhere" as a hint, not an error.

### 6.5 Starter tilesets

**State of the bundle.** There is no tileset a new project may use. `blank-starter` ships one
character sheet and no tiles: New Project opens a 20×14 map with nothing to paint with.
`zelda-like`'s art is derived from Nintendo's and sits under a non-commercial fan licence
(`games/zelda-like/LICENSE.md`); the app must not offer it as a pack or copy it into a user's
project. The first pack is therefore a prerequisite of the child path, not polish.

**The first pack (human task H1 in §9).** One 16 px set, CC0 or equivalent with the
attribution recorded, about 64–128 tiles: grass, path, water with edges, trees, a house with
a door, a fence, a sign, a chest. It ships with tile names, ground tags and walls already set,
so search, the Floor row and collisions work from the first minute. `blank-starter` then
includes it, which makes Blank a real "New game" (§4.1).

**The shelf.** A **Starter packs** shelf of cards (2 columns on phone) appears in four places
from one widget: the foot of the Brush page, the New-map dialog's Tiles strip, the Graphics
empty state and "Add graphics". Tapping a card copies the pack into the project (an
`Adw.Spinner` on the card while it copies), selects it as the active tileset and scrolls the
palette to it. More packs (Cave, Town, Indoors) are more cards; nothing else changes.

**Until a pack exists** the shelf is hidden — an empty shelf is dead furniture — and the Brush
page of a project without tiles shows its empty state with "Import a picture…" as the one
action (§4.9).

### 6.6 Things empty state and creation

See §4.9. "New thing" opens an `Adw.Dialog` whose first page is a template grid (picture +
child name + one line: "Door — takes the hero to another map"), second page the name. Creating
lands on the detail with "Place on map" focused. Templates offered come from the enabled game
systems.

### 6.7 Game view structure

See §4.5: title card, Checkup, Start, Rules, About.

---

## 7. Visual language

**Spacing** — a 6 px unit: 6 (inside controls), 12 (OSD margins, card padding, group gaps),
18 (section gaps on phone), 24 (page margins on wide, section gaps). Content columns clamp at
640 (forms) / 720 (pages) / 960 (galleries).

**Targets** — phone: 44 × 44 px outer minimum (GTK `min-width` is the content box — see the
64 × 54 px incident in `responsive-chrome.md`), 48 px for the badge and FAB height. Pointer:
34 px.

**Radii** — cards and sheets use Adwaita's own (`.card`, `--window-radius`); OSD toolbars
16 px; single-purpose pills, chips and FABs fully round (`.pill`, `.circular`); coach marks
12 px. **Pixel art has no radius**: tiles, swatches, sprites and map previews are square and
scaled nearest-neighbour at whole factors only. Below 1× — atlas cards at Fit, tileset and map
thumbnails — there is no whole factor: those downscale with a linear filter (trilinear where
mipmaps exist). Selection on pixel art is a ring *outside* the image (2 px accent + 1 px
gap), never a tint over it.

**Colour**

| Role | Token |
|---|---|
| Primary action (Play, Open, Create, Continue, Place on map) | `suggested-action` → `--accent-bg-color`; the system accent, never a fixed blue |
| Chrome over a map | `.osd` in both styles — the map's colours are arbitrary, so the scrim is constant |
| Docked bar, sheets, dialogs, content pages | window / view / sheet backgrounds from Adwaita; follow light and dark |
| Canvas backdrop outside the map | `--scratchpad-*` (theme-aware, as today) |
| Destructive (Delete map, Stop sharing) | `destructive-action` |
| Problems (door to nowhere, walls overlay, checkup errors) | `--error-color` / `--error-bg-color`; warnings `--warning-color` |
| Planes | three fixed hues from the Adwaita palette (below = `--green-4`, hero height = `--yellow-4`, above = `--blue-3`), used only for the badge ring, plane chips, layer section marks and the hover ghost |
| People | `colourForPeer` — cursors, selections, avatars, dots. Never the accent, never a plane hue |
| Run state | 3 px inset border in `--accent-color` |

Never colour alone: the plane ring is paired with the plane's glyph, door states with line
style, peers with initials.

**Typography** — Adwaita Sans throughout; no pixel font in chrome. `title-1` page titles and
hero names; `title-4` card names; `heading` group titles; body for rows; `caption` +
`dim-label` for meta; `numeric` for zoom, sizes and coordinates; monospace only for the session
code. Sentence case everywhere, no capitals for emphasis, no trailing "…" unless a dialog
follows. One explanatory sentence per page at most.

**Icons** — symbolic, 16 px in rows and pills, 20 px in the phone bar and bottom nav. Move =
hand, Paint = pencil, Fill = bucket, Erase = eraser, Pick = dropper, Thing = shapes. A label
accompanies an icon wherever width allows.

**Motion**

| What | Timing |
|---|---|
| Reveals, crossfades, page pushes | libadwaita defaults (≈ 200–250 ms ease-out) |
| Sheet detents, zoom snap, card lift | `Adw.SpringAnimation`, critically damped, ~300 ms settle |
| Press feedback | scale 0.96, 80 ms |
| Badge pop, tile flash on undo | 150 ms |
| Transient OSD (zoom %, "Undid: Paint") | in 100 ms, hold 1.2 s, out 200 ms |

Everything honours `Adw.get_enable_animations()`: with animations off, states switch at once
and the flashes become a 1-frame outline.

**Light and dark** — content views follow the system style. Canvas views look the same in
both, apart from the docked bar and sheets. Screenshots for Flathub are taken in light, on a
project built from the first starter pack — not on `zelda-like` (§10).

---

## 8. Collab-readiness of new mutations

Per the repo's litmus (a `Command` for map state, a `__project/*` op for project data,
awareness for presence):

| New capability | Rides |
|---|---|
| Rename / Duplicate / Delete layer | `RenameLayerCommand`, `DuplicateLayerCommand`, `DeleteLayerCommand` — registered in `BUILT_IN_COMMANDS` + `registry.spec.ts` |
| Placement override edits (Selected page) | same-id `PlaceObjectCommand` (update-by-replace) |
| Stamp stroke | one tile-paint command per stroke (existing vocabulary, larger payload) |
| Create / rename / duplicate / delete / move map, set start map | `__project/map.*` and `__project/startup.set` via `ProjectStore` |
| Door target ("Goes to", door back) | placement commands on both maps; the pair is two commands in one undo group |
| Tile collider presets and shapes | `__project/spriteset.update.chunk` (exists) |
| Starter pack added | the sprite-set import project-op (exists) |
| Peer location, follow, "editing this entity" dot | awareness (`AwarenessManager`), never the op-log |
| Atlas camera, per-map editor camera, sheet detent, list/map mode, onboarding step | local UI state; not synced |

---

## 9. Phased implementation plan

Small, shippable steps, ordered so the phone becomes usable first. Each step updates
`responsive-chrome.md`, `TODO.md` and the affected guards (`check:mode-routes`,
`check:chrome-stages`, `check:blp-actions`) in the same commit.

**Task H1 — the first starter pack (human, start now).** Source one CC0 16 px tileset
(§6.5). It gates steps 3.6 and 7.5, the Tiles and Floor rows of 5.1, the template order flip
of §4.1 and the Flathub screenshots. Nothing in Phases 0–2 waits for it.

**Phase 0 — Honest baseline (no new architecture)**

| # | Step | Resolves |
|---|---|---|
| 0.1 | `Gtk.WindowControls` on every screen that lacks them: Welcome, atlas, Game, the editor's context pill, Things on phone | no close button (`desktop/01`, `/02`, `/06`, `/07`, `phone/04`) |
| 0.2 | Map name in the editing pill / phone back button, with the map popover | unnamed map |
| 0.3 | Rename inspector tabs to Brush · Layers · Selected, switcher on top; "Object" tool → "Thing"; tileset display name in the palette header | vocabulary drift; "lokiri-forest" |
| 0.4 | ~~Opening and run camera clamp to the map (§4.3, §4.6)~~ **Skipped: the camera is correct, the strip is map data (risk 10).** | 80 px backdrop strip (`*/07`); block behind Stop (`desktop/11`) |
| 0.5 | Things stops listing characters; Things and Characters empty states; "+" on phone | brief: Things empty state | — done except the phone "+" (open, see TODO.md)
| 0.6 | Welcome: hide missing recents behind "Tidy up"; new title and tagline; drop the template filter; example first; template `kind` + `caption`; rename the example project to "Kokiri Forest" | `desktop/01` | — done
| 0.7 | Remove dead furniture: empty cursor capsule, "Teleport" legend chip, "★" badge, "No selection" pane, minimap when the world fits, "Always on" group in Simple view | principle 6 |
| 0.8 | Brush page empty state for a project without tiles ("Import a picture…"). No baseline shot exists of `blank-starter`: capture one first and confirm what a new project shows today | Blank is a dead end | — done (desktop Brush tab; phone Brush page still open)
| 0.9 | Atlas card titles above the card at up to 200 px; atlas opens scrolled to the start map | "Link'…"; `phone/02` | — done (size label hidden at <=200 px instead of moving the title)

**Phase 1 — Touch canvas**

| # | Step | Resolves |
|---|---|---|
| 1.1 | Pinch zoom + two-finger pan (`Gtk.GestureZoom`), whole-pixel snap, stroke cancel on second finger | TODO "No pinch-to-zoom on the scene canvas" | — done (`pinch-zoom.ts` over the pure `touch-gesture.ts`; there is no drag-stroke to cancel yet, see TODO.md)
| 1.2 | Move tool on touch (one-finger pan, tap select), armed on open | accidental strokes | — done (`select` was already the default `win.set-tool` state; now pinned by `window-actions.gjs.spec.ts` and the phone tool order leads with it)
| 1.3 | Undo/redo pill bottom-left on phone; two- and three-finger tap | thumb reach; undo invariant kept | — done (`history_pill`, phone-only; `cursor_caption` is wide-only now that the corner is taken; taps via `multi-finger-tap.ts` over the pure reducer — the "Undid: Paint" OSD is not built, see TODO.md)
| 1.4 | Long-press menu on placements; badge pop on pick | brief: long-press | — done (`long-press.ts` → `Engine.longPressAt`; tool-first dispatch: a paint tool picks the tile under the finger and pops the badge, `select`/`object` opens the placement menu — Edit · Copy · Delete; "Goes to… ›" skipped, it needs the §6.2 map + spawn-point picker, see TODO.md)

**Phase 2 — Navigation shell**

| # | Step | Resolves |
|---|---|---|
| 2.1 | `root_stack` / `shell_stack`; `Adw.ViewSwitcherBar` on phone, `Adw.ViewSwitcher` on wide; delete `ModeRail` and the left split views | drawer navigation (`*/09`) | — done (`ViewName` is now `welcome \| world \| library \| game \| map`; `ModeRail`, the tablet breakpoint, `win.toggle-library`, `show-library` and `library-collapsed` are gone — `compact` replaces the latter; `$PixelRpgProjectMenuButton` re-homes `primary_menu` out of the rail, which pre-lands part of 2.2; the library chips are an `Adw.InlineViewSwitcher`; the no-reparent invariant is proven by `DebugStatus.sceneEditorRooted` + `drive.py`'s `enterleave` scenario, backed by `check-mode-routes.mjs`)
| 2.2 | Primary menu and roster on every project screen; Preferences dialog regrouped | orphaned "Settings" | — done (the menu re-homed in 2.1; `$PixelRpgRosterChip` now sits in the World / Library / Game headers beside it and in the scene editor's context pill, fanned out by `ApplicationWindow._wireRosterFollow` and held by `check-mode-routes.mjs` check 12 + `drive.py`'s `require_roster_chips`. Preferences is one page of **View** + **Editing**, the latter backed by `EditorDefaultsService` / GSettings `show-grid-default`, which SEEDS `win.toggle-grid` rather than mirroring it. The Together and Help groups and two Editing rows are deferred to the features they configure — see TODO.md)
| 2.3 | Back order (§3.4) and deep-link back stacks | — | — done (one pure `resolveBackStep()` over a flat `BackState` decides what a back undoes; `win.back` performs it and all five gestures route through it — the header button, `Esc`, `Alt+←`, mouse button 8 and the shell's own back. `Esc`/`Alt+←` deliberately live in a new `WINDOW_SHORTCUTS` table and a BUBBLE-phase `Gtk.ShortcutController`, not `WINDOW_ACCELS`, so popovers, dialogs and entries keep first refusal; `check-mode-routes.mjs` check 13 holds the step list and its performers together. Deep links gained the missing half: every Library page now has `hasPushedPage()`/`popPage()`, and `win.focus-placement(mapId, placementId)` opens a map *with* a selection — it parks the id and drains it on `onEngineReady`, because a selection written during the load lands on the scene the load replaces. `GLib.Variant` marshalling learned tuples, without which `(ss)` was unreachable from the Control plane. "World centred **and zoomed** on the map just left" is centre-only: `AtlasCanvas` is a `Gtk.Fixed` with no fractional scale — see TODO.md)

**Phase 3 — The sheet**

| # | Step | Resolves |
|---|---|---|
| 3.1 | Split the inspector panes from their `Adw.OverlaySplitView` host into three movable pages | TODO "The phone bottom sheet has one page" (the stated blocker) | — done (`EditorPages` owns one `BrushPage` / `LayersPage` / `SelectedPage` and `host(slots)` parents them into a `PageSlots` triple; `SceneEditorView` holds the instance and hosts into `RightInspector.pageSlots` on wide, `SceneEditor.pageSlots` — a switcher + `Adw.ViewStack` in the sheet — on phone. `win.sheet-page(brush\|layers\|selected)` replaces `win.set-inspector-tab` and routes to whichever host the layout uses, so the wide badge's popover is gone and the badge is a plain button on that action. The placement-list page had no home in the three-page design and was deleted with `buildPlacementRows` — see TODO.md. `SelectedPage` keeps its pre-redesign content until 3.3)
| 3.2 | Sheet with switcher and `SheetDetents` (Peek / Half / Full), camera bottom inset | same | — done (`sheet-detents.ts` is the whole decision as pure arithmetic — heights clamped into `[bar, full]`, nearest-snap with ties to the shorter, a ≥ 400 px/s fling taking the next rung and never skipping one — and `SheetDetentController` is the GTK half, kept plain rather than a `GObject` the way `EditorPages` is. Three things the widget's docs do not say decided the shape: `sheet-height` is READ-ONLY, so a `height-request` on the sheet child is the control (libadwaita allocates that child's natural height); the child cannot be an `Adw.ToolbarView`, whose `[top]` is a `GtkWindowHandle` the sheet's swipe tracker force-claims every drag from; and libadwaita's own drag handle is an internal `can-target: false` `AdwGizmo`, so `show-drag-handle` is off and a full-width `sheet_grabber` carries the drag (claiming at 4 px, inside GTK's 16) and the tap. Only Full is modal — at Half a stroke must still reach the canvas, which is the point of the rung — and the camera ducks at Half ONLY, via `Engine.setViewportInset` + the pure `services/viewport-inset.ts`: host state, deliberately not on the op-log, since a peer's sheet is at its own detent. No keyboard path to the detents and a one-step `collapseSheet` are deferred — see TODO.md)
| 3.3 | Selected page with placement overrides; contextual action bar; phone stops using the inspector drawer | same; TODO "Object-system editor UI follow-ups" (a), (c); `phone/08` | — done (the page edits a placement's name and its component overrides in place through `EditOperations.setPlacementOverrides`, which writes a **same-id** `PlaceObjectCommand` — update-by-replace, already undo-safe and collab-syncable, so 3.3 adds no command at all; Duplicate is a new-id `PlaceObjectCommand` and Delete the existing `RemoveObjectCommand`. The host dropped its stale `_placementInfo` snapshot for live `MapData` + entity library + object sheets, which is what fixes Copy clearing the page it had just filled. On phone the second row of `phone_bar` crossfades into the contextual bar and the sheet does NOT open — `revealForSelection()` declines while collapsed, and *Edit* is the opt-in. *Move* shipped as a one-shot tap; the drag, and the insensitive switcher item libadwaita cannot express, are in TODO.md. The scene-metadata rows were deleted, not moved: step 5.4 creates them)
| 3.4 | Brush page: Tiles \| Things switch, tileset chips, contiguous sheet palette | TODO "Object-system editor UI follow-ups" (b) | — done (`TileSheet` draws the whole tileset in ONE `append_scaled_texture` at an integer scale toward 48 px tiles, so the forest's trees arrive whole; all of its arithmetic — grid, scale, hit-test, span, rect — is pure in `tile-sheet.geometry.ts` and unit-tested. Tiles and Things are an `Adw.ToggleGroup` over a `Gtk.Stack`, which is what resolves (b): the Things grid no longer sits under a long palette. The map's tilesets are chips carrying a sheet thumbnail inside the Tiles pane, and they are now the ONLY way to change the painting sheet — the `win.switch-tileset` dialog, `presentTilesetSwitcher` and `asset-dialogs.ts` are deleted, replaced by `win.select-tileset(s)`, which the window answers because it owns the project and the sets' `firstGid`. Arming a Thing collapses the sheet. The stamp half of the drag and the dropped search row are in TODO.md)
| 3.5 | Layers page: rename / duplicate / delete commands and UI; Things eye to the view menu; plane-tinted ghost | TODO "Layers page follow-ups" (a), (b), (d) | — done (three registered commands — `RenameLayerCommand` in `layer-lifecycle.command.ts`, `DuplicateLayerCommand` + `RemoveLayerCommand` in `layer-content.command.ts` — where duplicate and remove share one `LayerContentPayload` capturing the layer, its index, its tiles and every placement that referenced it, which is what makes the revert put the content back and not just the row; the placement writer and the content snapshot were pulled out into `services/placement-store.service.ts` + `services/layer-content.service.ts` so attach / detach has one implementation. The UI adds NO `win.*` action: each row carries a `Gtk.MenuButton` over a per-row `Gio.SimpleActionGroup`, so "Delete" can be insensitive on the last layer and "Move up / Move down" insensitive at an end — a parameterised window action cannot be per-value insensitive, which is also why "Move to plane ▸" omits the layer's own plane. Move up / down / to plane reuse the drag path (`layer-move-requested` → `resolveLayerDrop` / the new pure `resolveLayerNudge`) rather than inventing keyboard-only commands. `win.new-layer` took a `s` parameter so each section's "Add a layer" row names its plane and Simple view's single row passes `''` for the active one. The eye / lock / "⋯" targets are 44 px unconditionally, not phone-scoped: a row height that changed with the tier would change the sheet's content height, which is an input to its detents. The ghost's tint comes from the engine's new `PLANE_TINT`, which `depth-glyph.geometry.ts` now reads its hex fallbacks from, so the canvas and the glyph cannot disagree. The mock's `≡` handle is deferred — see §6.3 and TODO.md)
| 3.6 | Starter packs shelf at the foot of the Brush page and in its empty state; `blank-starter` includes the first pack — gated on H1 | TODO "No bundled tileset collection" |

**Phase 4 — Play on touch**

| # | Step | Resolves |
|---|---|---|
| 4.1 | Virtual joystick + action button as an `InputSourceComponent` producer | TODO "A phone Live Run has no way to steer the hero" | — done (the controls are overlay children of the *engine* widget, so the scene canvas and its container are untouched and the run keeps its own gesture, visual and intent in one place. The stick's geometry — region test, 40 px travel, 10 px dead zone, 8-way quantisation — is pure in `virtual-stick.ts`; `stick-drag.ts` is the `Gtk.GestureDrag` adapter, consulting `isStickEnabled()` *before* claiming, because a claim is unconditional and a merely-invisible stick would eat brush strokes in that corner. The intent reaches gameplay as `TouchInputComponent` + `mergeInputIntents`, not as a direct `InputSourceComponent` write. 8-way rather than analog so touch produces exactly the keyboard's vectors — diagonals pre-scaled by 1/√2 — and introduces no second movement feel; the throttle is in TODO.md. Entering a run on phone now also collapses the bottom sheet, which otherwise rested over both controls) |
| 4.2 | Wide run state: accent border, Restart, Test run hides editing chrome; `Adw.SplitButton` Play | `runtime-modes.md` Test-run row (wide) | — done (`chromeFlags` now reads `playing` in both layouts: wide loses the editing pill, tool group, undo/redo, badge label and inspector toggle, the inspector itself is put away and restored, ↺ Restart joins the context pill in both layouts while ■ Stop stays phone-only — the wide FAB has one verb to spare, not two — and the canvas gains `runBorder`. The frame is a `can-target: false` overlay child above the canvas rather than a style on the backdrop: GTK draws a border under a widget's children and the engine fills the backdrop, so a frame there never shows — and it would re-allocate the GL area by 4 px at every Play/Stop for a decoration. The Play `Adw.SplitButton` with "Play from the start" already shipped in Phase 2. **The run clears the wide chrome because it is a Test run by the engine's markers** — `applyRuntimeMode` swaps `EditorMode` for `RuntimeMode` — and the same commit gates `TileEditorSystem`'s tap / long-press / hover on `EditorModeComponent`, closing the documented drift gap where a focus-seeking click during a run painted a tile. §4.6's wide *Live* Run, where the tools stay because both markers are present, needs a second entry point: deferred to TODO.md) |
| 4.3 | Camera snaps to the hero on Play; whole-pixel play zoom for "Play from the start"; chrome follows teleports | TODO "Play-mode presentation gaps" (b), (c) | — done (three separate defects, one per piece. **Camera**: `lockCamera` now writes `camera.pos` itself instead of waiting for the first strategy tick, so the opening frame is drawn at the hero rather than wherever the editor had scrolled; the clamp is our own `MapBoundsCameraStrategy`, because excalibur's `limitCameraBounds` has no case for a map *smaller* than the view — both its branches resolve to `left + halfDrawWidth` and park a small interior room against the top-left. **Zoom**: `Engine.applyPlayZoom` picks the largest whole-pixel level that still shows ≥ 15 × 10 tiles, rounding *down* to a level rather than to the nearest one — nearest would pick 2× for a 360 px phone view, show 11 columns and break the promise. It runs from `win.play-from-start` only and *before* the mode flip, since the clamp reads the zoom to know how much world the view covers; "Play here" and Restart keep the editor's zoom per §4.6, which TODO.md now questions. **Teleports**: nothing in the maker listened to `MAP_LOADED`, so walking through a door left the pill name, header title, inspector pages and `SceneNavigator._currentSceneId` on the room the hero had left; the new `map-loaded` hook reaches `SceneNavigator.followEngineMap`, which deliberately does not reuse `setScene` — that resets the zoom readout to 100% and a teleport carries the run's zoom across) |

**Phase 5 — World**

| # | Step | Resolves |
|---|---|---|
| 5.1 | New-map dialog (Name, Size; Tiles and Floor rows once H1 has landed); rename, duplicate, delete, start map | TODO ""New scene" action" | — done (all five verbs are registered window actions in `map-actions.ts` — `win.new-map` takes the FAB's slot from the stub `win.new-scene` — and every one of them rides a *command* through `ProjectStore`, so each is undoable and reaches peers: `__project/map.create.chunk`, `map.rename`, `map.remove`, `startup.set`. **`map.create` is chunked** like a spriteset because a map's JSON is the one project payload that routinely exceeds the 16 KiB op budget — the sample map is 2.6 MB — and it reuses the generic `buildChunks` / `OpChunkReassembler` rather than a second mechanism; "move map" needs no op, `map.editor-data` already carries it. Two §6.1 deviations, both forced by the same thing: the four selection verbs live in a `SceneInspector` preferences group and rename is a dialog, *not* inline on the card title, because `SceneCard`'s drag gesture claims presses in the CAPTURE phase and would swallow any control or editable label on the card — 5.4 moves them to the selection bar, where the gesture is not in the way. The geometry and naming are pure in `project-store-maps.ts` (presets, `nextMapName`, `duplicateMapName`, `freeAtlasSlot`, `draftMapData`, `countDoorsInto`) and the store stays UI-free: it takes the translated templates and the first layer name as arguments. A peer-supplied map id is gated on `isPlainFilename` and the file path is *derived* from the vetted id, never taken from the peer. `applyMapCreate` / `applyMapRemove` repoint `startup.initialMapId` when it would otherwise dangle, since `GameProjectFormat.validate` throws on an unresolvable start map; `removeMap` refuses the last map. Creating opens the new map once the `maps-changed` refresh settles — duplicating deliberately does not. Tiles and Floor rows, the new card landing near the viewport centre and its 200 ms scale-in are in TODO.md: the first waits on H1, the other two on 5.2's camera) |
| 5.2 | Pan/zoom controller, open at Fit, pinch, persisted camera | TODO "True zoomable atlas surface" | — done (the atlas is now a camera over a world measured in **atlas px**, where 1 atlas px = 8 game px (`GAME_PX_PER_ATLAS_PX` in `project-loader.ts`) — a unit chosen so the positions already persisted in `MapData.editorData` (origin 20, step 360 × 240) stay valid and nothing had to be migrated. Zoom `z` is widget px per atlas px, clamped to `[0.1, 4]`, and the maths is pure in `packages/gjs/src/widgets/editor/atlas-camera.ts`: `drawnRects`, `cardPixelSize`, `drawnExtent`, `fitZoom`, `zoomAroundPointer`, `surfacePadding`, `centeredScroll`, `clampAtlasZoom`. **No `Gsk` child transform**: the cards are sized in pixels and painted at that size instead of a scaled `Gtk.Fixed`, so the title stays legible at every zoom and hit-testing is still a rect test. The surface is the drawn extent **plus `2 × surfacePadding`**, recomputed on `notify::page-size` of both adjustments (reentrancy-guarded) — that is what makes Fit centre and gives a world that fits zero scroll range; without it the scroller clamped the centring scroll to an extent that was exactly the content. Scroll writes go through `_applyScroll` → `_applyScrollAxis`, which re-applies once per axis when the clamp actually bit, because a scroll set before the surface has grown is silently truncated. That re-apply is **scheduled on an idle** (`_queueScrollWrite`, cancelled from `_applyScroll` and `vfunc_unmap`) rather than written straight from the `notify::upper` handler: `Gtk.Viewport` emits `upper` from inside its own `size_allocate`, and an `adjustment.value` written from there re-allocates the child during an allocation, which GTK drops — leaving the adjustment holding the new offset while the viewport keeps drawing the child at the old one, permanently and with no warning. That desync is what clipped the desktop atlas; the tablet and phone tiers never showed it because their first write already landed inside the clamp. **The camera persists in per-project LOCAL state, not in the project** — `apps/maker-gjs/src/services/atlas-camera-store.ts`, `$XDG_DATA_HOME/pixelrpg/atlas-cameras.json`, keyed by project path, 32 projects evicted by insertion order, modelled on `recent-projects.ts`. This is a documented deviation from "persisted camera" reading as `editorData` (precedent: 3.2's viewport inset): `editorData` is project data that rides `__project/map.editor-data` to every peer, so banking a pan there would make scrolling a broadcast op and two people looking at the same world would fight over one camera. A reload of the *same* project keeps the live camera (captured before the relayout), switching projects banks the outgoing one and restores or `fit()`s the incoming one, and `_saveCamera` runs from `vfunc_unmap` and the project switch — never per pan. **A fit is not a camera and is never persisted** (`AtlasCanvas.isFitted`, stored as `null`, which forgets any earlier entry): a fitted camera *follows* the viewport and re-fits on every later resize, because `fit()` runs as soon as the scroller reports any page size at all — on startup the window's full height, before the 48 px header bar has been taken out of it, which left the bottom row of cards clipped off the viewport for the rest of the session. Re-fitting also takes a newly created map into account, which restoring a stale fit would crop out. Pinch is a `Gtk.GestureZoom` on the scroller anchored at `get_bounding_box_center()`; Ctrl+scroll is a CAPTURE-phase `Gtk.EventControllerScroll` so it beats the scroller's own wheel handling. `stepZoom` applies the window's `ZOOM_STEP` as a **ratio** (× 1.2 / ÷ 1.2), not an offset — an additive 0.2 is a third of the way at 60 % and a twentieth at 400 %. The overview minimap is now hidden whenever the world already fits the window, and on phone unconditionally, where it cost a corner for no information. `fitZoom` refines in a bounded loop (`FIT_REFINE_PASSES = 8`) against a generous margin because it knows the body rects, not the title overhang; that, the centre-only `focusScene`, the approximate `zoomAroundPointer` and the missing animation are in TODO.md) |
| 5.3 | Whole-map cards with a minimum size, replacing the per-card section + lock (after the owner's yes, §10) | `desktop/02`; reverses "Viewport scene-card previews" | — done (a card is now a centred title row — `media-playback-start-symbolic` badge bound to the new `start-map` property, then an ellipsized name — **above** one `Adw.Bin` body holding a `MiniMap` that paints the whole map with Fit (`fitDestRect` + `append_scaled_texture`). The title sits outside the body rather than over it so that it needs no scaling, no `can-target: false` and no title-bar inset: `teleport-overlay` lost `TITLE_BAR_HEIGHT` and `teleportEndpoint` now takes a card rect directly. A card never goes below a 64 px short side, 72 px on phone (`CARD_MIN_SHORT_SIDE*`, selected by a `compact` property bound from `atlas-view.blp`), because a sub-64 px card is an unreadable smudge that is also too small to grab. **The viewport mode is gone, not disabled** — per the anti-parallel-state rule the same change removed `PreviewViewport`, `setViewportZoom` / `panViewportBy` / `commitViewport`, the viewport bake, `clampViewportCenter` / `viewportSourceRect` / `tileIntersectsClip`, `buildDrawOps`' clip parameter, `CacheKeyViewport`, `withPreviewViewport`, `MapPersistenceController.persistPreviewViewport`, `MapEditorData.preview` and `SampleScene.previewTileX/Y`, along with the card's lock button, size label, "★ things" badge, `preview-pan-*` / `lock-changed` signals, `dragModeFor` and the `NARROW_CARD_PX` `vfunc_size_allocate`. Nothing now chooses between a pan offset and a fit. The `176 × 148` size text and the thing count are not lost but relocated — 5.4's selection bar is their home, and until it lands the card shows neither. `BAKE_MAX_EDGE` stays 512, so a card wider than ~3 px per tile upscales the bake; raising it is a memory trade recorded in TODO.md rather than taken blind) |
| 5.4 | Selection bar replaces `SceneInspector`; Map settings dialog; list mode in "⋯" | `phone/02` | — done (`SceneInspector` is **deleted**, and with it `sceneSubtitleText` / `sceneStats` / the `show-inspector` plumbing of the world view: a selection now reveals `MapSelectionBar` — name, a `176 × 148 · 2 doors` caption, Open, and a "⋯" carrying Rename… · Duplicate · Start the game here · Map settings… · Delete. **Two instances, one data path**, because a Blueprint `bind` cannot cross a template boundary: the wide/tablet one is the 4th overlay child of `atlas-view.blp` (`floating: true` → `toolbar`+`osd`), the phone one lives in the window's `[bottom]` slot inside `Gtk.Stack bottom_bar_stack` (pages `nav`/`selection`), handed over by `attachSelectionBar` like `attachShellSwitcher`, and `_refreshSelection()` fills both. The same menu is the card's long-press / secondary-click menu — ONE lazily built `Gtk.PopoverMenu` parented on the canvas overlay, the per-card gestures dying with the card. The settings dialog is an instant-apply `Adw.PreferencesDialog`: Name is an `Adw.EntryRow` whose `::apply` fires `map.rename`, and **Size, Tile size and Things are read-only** with Doors as one `Adw.ActionRow` per teleport. That is a deliberate narrowing of §6.1: `MapData` carries no `music`, no `encounters` and no `onEnter` to edit, and resizing needs a rule for tiles and placements outside the new bounds that the design does not give — both in TODO.md rather than guessed at. List mode is a `Gtk.Stack` over the canvas (`surface_stack`, pages `grid`/`list`) driven by the stateful `win.map-list` (`Ctrl+L`, also in the shortcuts window), with the item reaching the context pill through `ProjectMenuButton.setExtraSection` — set on the world view's own instance, since the template's `primary_menu` is shared by four views and mutating it would leak the item into the map editor. The rows are an `Adw.ActionRow` each over a `Gtk.ListBox`, not the §4.2 `Gtk.ListView`: with a handful of maps a factory buys nothing and the rebuild matches `layers-page.ts` (precedent). The 56 px thumbnail is a `MapPreview` where the project has the map and the card's `MiniMap` otherwise, clipped by `Gtk.Overflow.HIDDEN` because `MiniMap` paints fixed-size squares and does not fit. The row's "peers present" column is skipped — awareness does not yet report which map a peer is looking at — and is in TODO.md. Two side findings: `accessible-name:` on a `Gtk.Button` passes every static gate and makes GTK reject the whole template at run time, and `check-mode-routes.mjs` had to be scoped to the two navigation stacks or it demanded a `ViewRoute` for `bottom_bar_stack`'s pages) |
| 5.5 | "Goes to" flow with pick mode and door back | making a connection without typing ids | — done (a door's target is now readable and settable without ever naming a map id: the Selected page grows a **"Goes to" `Adw.ActionRow`** stating the map at the other end — or "Nowhere yet" with a `dialog-warning-symbolic` suffix, the same broken-door wording 5.6 put in the atlas — and activating it starts `DoorTargetFlow`: a map picker (`Adw.Dialog`, one row per map, subtitles reusing `mapCaption(mapSelectionFacts(…))` so a map reads the same here as in the atlas list, the current target marked with `object-select-symbolic`), then a trip to that map in **pick mode**, then the tap that becomes the arrival tile. Pick mode follows the `pendingPlacementMove` precedent exactly — a `PendingArrivalPickComponent` armed on the TARGET scene via `Engine.armArrivalPick`, consumed first in `tile-editor.system.ts applyClick` and disarmed before `ARRIVAL_PICK_REQUESTED` goes out — which buys cancel-on-navigate-away for free, since leaving the map drops the component with the scene. `chromeFlags` takes a fourth input `picking` for it: everything `playing` removes plus the Play FAB and the "⋯", leaving one `pick_banner` ("Tap where the hero arrives" · Cancel), because starting a run from the target map would strand an armed pick behind a runtime that cannot consume it. **Cancel is the signal `pick-cancelled`, not `win.back-to-atlas`** — the host owes the person the map they came from, which the banner cannot know. Three entry points (`win.door-target`, the canvas long-press menu's "Goes to…", the Selected row) converge on `SceneEditorView.requestDoorTargetForSelection()` → `door-target-requested`, so there is one road to the flow rather than three; the menu entry is appended only while the selection is a door (`setPlacementSelected(name, isDoor)` rebuilds the `Gio.Menu` when that flips). The geometry and the model are pure in `door-target.model.ts` (`readDoorTeleport`, `doorTargetState`, `withDoorTarget`, `withDoorTargetComponents`, `oppositeFacing`, `planDoorBack`) and `DoorTargetFlow` is gettext-free with `report*` callbacks, like `SceneNavigator`. The **door back** ships on by default as a switch in the picker, but with two documented deviations. The geometry is not §6.2's literal reading — a door placed *on* the arrival tile targeting the source door's own tile would bounce the hero between two maps forever — so it lands one tile *opposite* the arrival `facing` and targets one tile opposite the source door, mirroring the step if that falls off the map and falling back to the tile itself; it is placed **inline** from the source door's resolved definition with only the teleport swapped, so it is one command and one undo entry. And **§8's "two commands in one undo group" is not possible today**: `UndoStackComponent` is per-scene while the two edits land on two different maps, so the door back is written while the target map is active and the door's own teleport after the trip home — two undo entries on two stacks. A cross-map undo group wants a window-level stack, which is a change to §8's model, not to this step; the reasoning sits in `DoorTargetFlow`'s class doc and in TODO.md. The door back also lands on the ACTIVE layer, so a locked active layer makes it fail — the flow reports that as a toast and still writes the door's own teleport, which is the half the person asked for. Targeting the same map is allowed and skips the navigation. No fifth pill joined the phone selection bar: `bar_row_b` already carries four verb pills beside a name ellipsised to `min-chars: 4`, so a fifth would be bought with the name, and the phone path is Edit → Selected → the row instead — one tap deeper, with the current target visible when you get there, which a pill cannot show) |
| 5.6 | Restyle the existing arcs: pair merge, one-way arrow, labels on demand, ends on door tiles, edge chips, nowhere-stubs | brief: labels overlap and cluster | — done (the arcs are now a *model* before they are a drawing: `map-connections.model.ts` turns the flat door list into `MapConnection`s of kind `pair` / `one-way` / `broken`, and `teleport-overlay.ts` only paints what that says. **Two doors merge into one line when each lands within one tile of the other's own tile** (`PAIR_TILE_SLACK = 1`, Chebyshev, greedy over the closest candidates first and ties broken by input order, the connection emitted at the lower door index). The slack is the whole point: in the real project Kokiri Forest's door at (76, 67) is entered from Link's Tree House at (76, 68), so an exact-match rule would have found a return path nowhere and drawn every door in the game as one-way. **A door whose target does not resolve is now first-class, not absent** — `collectAtlasTeleports` nulls `SampleTeleport.to` when the teleport names no map, names one the project does not have, or carries no arrival tile, and the model reads that `null` as `broken`; the widening of `SceneLink.to` / `TeleportSummary.otherSceneId` to `string | null` carries it into the caption (`%d goes nowhere`, plural-aware) and into Map settings' door rows ("No map at the other end yet", `dialog-warning-symbolic`). Before this a broken door was silently dropped from the atlas, which is the one case the user most needs to see. **The shape carries the meaning, not the colour**: a pair is a solid line with a door glyph at both ends, a one-way is dashed with an arrowhead and an arrival dot, a broken one is a short stub pointing out of the card with a red `!` disc — all three survive a colour-blind reading, and only the broken one uses `destructive_bg_color`. Labels appear **on demand**: a pill names the map at the far end only while the line is focused (touching the selection, or hovered), at `LABEL_T = 0.85` along the curve, mirrored to `1 - LABEL_T` with the *near* map's name when the selected card is the one being arrived at — repeating the selected map's own name next to its own card says nothing. Unfocused lines sit at 0.35 opacity while anything is focused and 0.85 when nothing is, and below `LINE_HIDE_ZOOM = 0.25` only the lines touching the selection are drawn at all: that zoom is where a line is thinner than the gap between two cards. Several connections between the same two maps fan apart (`fanGroups` + `fannedControl`) instead of stacking into one stroke. A line that leaves the viewport ends in a `→ Name` chip at the crossing point (Liang–Barsky in `clipToViewport`, clamped inside the viewport), and tapping it **pans** to that map without selecting it — the chip answers "where does this go", and a user comparing it against the map they had picked would otherwise lose the pick. All of the geometry is pure and unit-tested (`teleport-overlay.geometry.ts`: `fanFactor`, `fannedControl`, `pointOnQuad`, `distanceToQuad` over `QUAD_HIT_SAMPLES`, `rectContains`, `clipToViewport`, `stubEnd`); the widget keeps only the GTK. Two wiring notes: the overlay is `can_target = false`, so the canvas owns the pointer and feeds it the hover point, the visible region and the zoom — the viewport from the scroll adjustments as well as from the layout pass, because scrolling moves it with no layout running; and the chip rects are recorded **during the snapshot**, since a chip's size is the size of its text and only Pango knows that, so a click is answered against the frame the user was actually looking at. Not in this step and deliberately so: a line has no popover and a broken door has no repair path from the atlas — the first is 5.7, and the second 5.5 answers only from the scene editor, since the overlay does not yet hand back which door a stub belongs to) |
| 5.7 | Line popover and drag-to-connect (wide) | expert path | — done (a connection in the atlas is now something you can *act* on from the atlas. **A line answers a press with a popover** whose section heading is the connection itself — `Kokiri Forest ↔ Link's Tree House` for a pair, `A → B` for a one-way, `A → nowhere` for a broken door — over *Go to the door* per end, *Remove*, and for a broken one `_('Goes to…')`, the very msgid the scene editor's placement menu uses, so the repair reads the same wherever it is reached. Three pieces made that possible. `SampleTeleport` grew a `placementId` (`collectAtlasTeleports` carries it through from the `ObjectPlacement`) and `TeleportOverlay.connectionAt` now returns a `ConnectionHit` — the connection *plus* the `DoorRef`s it was folded from — which is exactly the thing 5.6 recorded as missing: without it a stub could state a problem it could not name. The menu is built as **facts → `Gio.Menu`** in `map-menu.ts` (`buildConnectionMenu`), not as a widget tree, and it is built **fresh on every press**: `Gtk.PopoverMenu` takes ownership of a model, and one lazily created popover re-pointed with `set_menu_model` is what keeps a per-connection menu from leaking a widget per line. There is deliberately **no new wide signal** for it — the items are plain window actions carrying targets (`win.unlink-door` as `a(ss)`, so one item can clear *both* ends of a pair; `win.fix-door` as `(ss)`), and "go to the door" is the existing `win.focus-placement` `(ss)` rather than a fifth verb that would do the same thing by another name. `fillPlaceholders` (`packages/gjs/src/utils/placeholders.ts`, single-pass, unfilled placeholders left standing) exists because a two-name title needs positional `%1$s / %2$s` for translators and gettext's runtime does not interpolate. **The expert drag path rides the gesture the cards already have.** `AtlasCanvas._wireDrag` asks once, at `scene-drag-begin`, whether the press landed on a door handle (`SceneCard.pressInParent` → `TeleportOverlay.handleAt`) and from then on the same `scene-drag-begin/-update/-end` stream either moves the card or aims the door — one stream, two meanings, decided once. A second CAPTURE-phase gesture competing for the same press was the first plan and was dropped: which one won would have depended on controller order. Only doors whose `from` is the selected map get a handle, because a handle means "drag me to say where this goes" and the far end of a pair grows its own when that map is selected; `handleAt` returns the whole `DoorHandle` so the dragged line starts at the door's *tile*, not at the pixel the finger hit. Drop resolves through `dropTargetAt`, which picks the card from the rects the camera last drew (the overlay is `can_target = false` and cannot pick its sibling) searching from the END of the list, matching `Gtk.Fixed` child order so the card the user sees on top is the one that wins. Five decisions worth stating, three of them deviations. **Every 5.7 write navigates to the door's own map and leaves the user there** (`SceneNavigator.open(mapId, onReady)`): driving an engine for a map that is not open is not available — `Engine` only has its Excalibur instance once the GLArea has realised — and a placement is scene state, so it must be a `Command` on that map's undo stack; dropping the user back on the atlas would park an undo entry on a stack they are not looking at. **"↔" for a pair** deviates from §6.2's single `→` example, because 5.6 made a pair *one* line and an arrow would claim a direction the line does not have. **A broken stub opens the popover rather than the fix flow directly**, deviating from "tapping opens the fix": a modal that appears without being chosen is the one outcome a mis-tap cannot take back. ***Remove* clears the target, it does not delete the door** (`withoutDoorTarget` keeps `facing` and `label`) — the person said the connection is wrong, not that the door is. And **the drag places no door back**, unlike 5.5's picker: that flow has already asked two questions and may ask a third, while a drag is one gesture meaning one arrow, and writing a second placement onto the target map would be an edit nobody asked for — the way back is a drag from the other side. One ordering note that is a bug fixed before it shipped: `_onSurfacePressed` tests the edge chips first (they are drawn at the viewport edge over whatever card is there), then **bails if the press hit a card at all**, and only then tests the line — a line ends on the door's own tile, so without that bail a plain click on a card near one of its doors opened a popover where the user had asked to pick the map) |

**Phase 6 — Library and Game**

| # | Step | Resolves |
|---|---|---|
| 6.1 | One gallery → detail pattern; `Adw.NavigationSplitView` on wide; single header on phone | TODO "Library follow-ups" (host header cannot show the detail title) | — done (navigation is **hoisted out of the chips into the host**: `library-view.blp` is ONE `Adw.NavigationSplitView` (`collapsed: bind template.inspector-collapsed`, sidebar 300–360 px) whose sidebar page carries the Library header, the chip `Adw.InlineViewSwitcher`, the per-chip gallery `Adw.ViewStack` and a "New …" `Adw.ButtonRow` pinned in the `Adw.ToolbarView`'s `[bottom]`, and whose content page carries ONE `Adw.HeaderBar` over a per-chip detail `Gtk.Stack` whose `visible-child-name` is bound straight to the gallery stack's. The single phone header and its back button are then not built at all — a collapsed `Adw.NavigationSplitView` is exactly that — and the detail title the TODO entry was about is `Adw.NavigationPage.title` on the content page, written from a new `detail-title` signal. **A chip is now two widgets**, a gallery (`CastView` / `ObjectsView` / `TilesView`, class names kept so `application-window.ts`'s API stays put) and a detail pane in the host's stack, which is forced rather than tidy: a collapsed split unmaps the SIDEBAR while the detail is up, so a single `SignalScope` spanning both halves would disconnect whichever half is off-screen. Each half connects its own in its own `vfunc_map`; the panes are driven by plain callback objects (`bindActions`) instead of new GObject signals, and are handed to their gallery once by a public `attachDetail(pane)` from the host's constructor — JS constructors do run for GtkBuilder-created template children. The host's six gallery connections are deliberately **not** map-scoped but made in its constructor: `setCharacters` / `setObjects` / `setProject` land while the Library is unmapped, and a `vfunc_map` connection would silently drop those titles. The host also records the last title per chip and re-applies it from the `chip` setter, so switching away and back does not leave the header naming the other chip's entry. `LibraryPage` is **deleted** — with the split hoisted neither remaining page has one to collapse, both are `Adw.Bin`, and `popPage()` / `hasPushedPage()` / `resetToOverview()` (what `installBackActions` reads) now answer from the host's one split. **`TilesQuickView` is gone, not hidden**: a 260–340 px sidebar cannot live inside a 300 px one, so its appearance glance moved into `TilesDetailPane` as a third page of an empty/tileset/appearance `Gtk.Stack`, and the header's quick-view toggle, `show-quickview` and every Library override of `_onInspectorCollapsedChanged` went with it — the pane takes that flag through a template binding. Graphics' title-1 heading and descriptive paragraphs were trimmed to what fits 300 px (search + sort, two section headings with "+", two galleries). Per § 4.4 the first entry is selected on arrival in all three chips, and that auto-select pointedly does NOT emit `detail-requested`: on phone it would land the user in a detail they never tapped. Things' detail delete button is parked in a per-chip `[end]` stack of the host header until 6.2 replaces it with the "⋯" menu. Three § 4.4 gallery details are deferred to TODO.md, all of them `CardGallery` work rather than navigation: the phone two-column grid with a FAB, the 56 px compact rows with a 40 px thumbnail, and search-on-typing / `Ctrl+F` for Characters and Things) |
| 6.2 | Detail cleanup; "Add an ability"; generated field → row mapping; dormant group | brief: sparse master-detail; TODO "The inspector shows a field's `min`…" is a natural rider | — done (the field → row decision is now a **pure function**, not a chain of `if`s inside a widget: `component-inspector.model.ts`'s `rowKindFor(field, optionCount)` answers `switch | spin | toggle-group | combo | entry | reference | json` — § 4.4's table verbatim, including the **four-option hinge** between an `Adw.ToggleGroup` in an `Adw.ActionRow` and an `Adw.ComboRow`, which is why the option *count* is a parameter and not something the widget reads off a model mid-build — and `spinGeometryFor` / `spinValueFor` / `defaultComponentData` sit beside it with their own specs. `spinValueFor` is where the TODO entry died: a numeric field with no stored value fell back to `field.min`, so an unset "Damage" opened reading `0` and an unset "Speed" read `1` — the lowest legal number presented as the author's choice. It now falls back to `field.default`, clamps into `[min, max]` and rounds for `int`, and `defaultComponentData` **omits** a field that has no `default` rather than inventing one, so "Reset to defaults" cannot write a number nobody chose. **"Add an ability" is grouped by the game system that owns it** (`entity-components-editor.model.ts`'s `addableComponentGroups`, registry order, empty groups dropped, a component whose owner is not registered contributing nothing) and opens as an `Adw.ActionRow`-per-component dialog (`add-component-dialog.ts`, 380×520) from an `Adw.ButtonRow`, replacing a flat `Gtk.MenuButton` menu that listed every component of every system as one undifferentiated column. The **dormant group** is the other half of the same model: `dormantComponentFacts(type, effective, systems?, known?)` distinguishes "this entity carries a component whose system the project switched off" — dimmed group, one row reading "Switched off in Game › Rules", a "Turn on" button — from "unknown component type", which stays the loud failure the game-systems contract requires, and returns `null` for both an unknown type and an unregistered owner. "Turn on" is a new `s`-typed **`win.enable-game-system`** rather than a per-host signal, enable-only on purpose: switching a system *off* needs the consequences dialog Rules owns (step 6.4). It renders in **both tiers** — a Simple-view author whose sheet is missing settings needs the same honesty as the "Show N more settings" row, and hiding the explanation would leave the gap without the reason. The Full-view component header's trash button became the **`Gtk.MenuButton` + Remove / Reset to defaults** menu § 4.4 asks for, driven by a `Gio.SimpleActionGroup` inserted on the inspector under the prefix `component`, so "remove" means *this* component without a target to mis-address; a `GMenuModel` carries no bindings, so Delete elsewhere is greyed out through the MenuButton's `sensitive: bind view.has-active` instead of the item. `_optionsFor` now `_()`s the built-in option msgids (`FACING_OPTIONS`, a spec's `field.options`) at the widget and lets asset names through raw — a pre-existing gap: every generated enum row rendered its English msgid in a translated UI. **Detail cleanup** split the Characters inspector into § 4.4's **Basics** (name · player · speed) and **Looks** (appearance picker · "Edit animations ›"), gave the detail ONE primary action by deleting the `suggested-action` "Edit appearance" pill that competed with "Place on map" — the row is the same destination stated once, and it carries the Full-view binding the pill used to, via a new `full-view` property on `CastInspector` — and made a character delete **undoable by toast** instead of a confirmation dialog (`services/entity-deletion.ts`, pure; the Undo re-runs `ProjectStore.upsertEntity(snapshot)`, an idempotent `__project/entity.upsert` that reaches peers, because project-level deletes have no undo stack to push onto). Three deviations are recorded in TODO.md rather than silently dropped: a reference row shows a symbolic icon where the design draws the referenced thing's thumbnail (`ComponentRefOptions` is `{ value, label }[]` and has nowhere to put a paintable), the picker is a dialog rather than a pushed page (6.1 removed the last navigation stack on purpose), and the name stays a label rather than an `Adw.EntryRow` on tap because the Basics group already edits it.) |
| 6.3 | New-thing dialog with templates | brief: Things | — done (§ 6.6's two pages are one imperative `presentNewThingDialog(parent, { templates, existingNames }, onCreate)` — an `Adw.Dialog` (440×480) over an `Adw.NavigationView`, the first real use of that widget in this repo. Page one is the template grid: a `Gtk.FlowBox` (two per line, homogeneous) of `Gtk.Button cssClasses: ['card']`, each a 32 px icon over a `heading` label and the template's own wrapped `caption dim-label` line, which is exactly the "picture + child name + one line" the section draws and no more. The grid is **flat** rather than grouped per game system — § 6.6 asks for a grid, and unlike 6.2's `addableComponentGroups` there is nothing to group by: `EntityTemplate` carries no owning-system id, only the registry's *filter* (`entityTemplatesFor(project)` already drops the templates of a switched-off system, so "templates offered come from the enabled game systems" holds without a heading). The `character` template is skipped: Characters has its own New Character dialog, and a second door into the roster from the Things grid is how the two drift. **Page two is built fresh on every pick**, not reused and re-labelled, so Back → a different template re-derives the suggested name instead of carrying the first one over; it is titled with the template's label, holds one `Adw.EntryRow` prefilled with the suggestion, puts "Create" in the header `[end]` as the `suggested-action`, and takes `entry-activated` as the same verb so the keyboard path never needs the pointer. Focus is grabbed from the page's `shown` through `GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, …)` — a `grab_focus` during the navigation animation lands on a widget that is not mapped yet. **The naming rule is pure** (`services/new-thing-draft.ts`, eight cases): `nextThingName(label, existingNames)` returns the bare label, then `base 2`, `base 3` … comparing trimmed, and `resolveThingName(typed, suggestion)` decides what an edited field means. Numbering starts at **2**, deliberately unlike `nextMapName`'s library-size counter — the first chest should be "Chest", not "Chest 1", and the counter version also names the second chest "Chest 7" in a project with six other things. `existingNames` is the **whole** entity library, characters included: it is one namespace, because `uniqueIdFrom` mints the id from the name. **Creation lands on the detail with "Place on map" focused**, as § 6.6 requires, through a new `ObjectsView.focusNewObject(id)` (focus the object, then `pane.focusPrimaryAction()` on idle) kept as a path of its own — moving focus inside `focusObject` would make a plain row click in the gallery yank focus out of the list the user is still reading. That pill is new too: Things' detail had no primary action at all, so `place_button` ("Place on map", `suggested-action pill`) joins `object-detail-pane.blp` over a new `s`-typed **`win.place-thing`**, mirroring `win.place-character` down to the "Open a map first to place a thing" toast. `object-create-requested` widened to `[STRING, STRING]` with an empty name meaning "call it after the template", which is what keeps `win.new-object` and the MCP bridge working unchanged through `ObjectsController.createFromTemplate(templateId, name?)`. `object-dialogs.ts` is **deleted** — its flat `presentTemplateChooser` is page one now. The other half of § 6.6, the empty state, was checked against § 4.9 rather than assumed: the status page was titled "No things yet" over a four-line paragraph explaining what a thing is, where the table asks for **"Things are what your hero finds"** and the section rule is "one primary action and never a paragraph" — the title now says it and the `description` is gone, which also stops the page explaining the feature twice (the template tiles under it are the explanation). One deviation, downwards: § 4.9's Things empty state keeps its **one-tap** create, so the Door · Chest · Sign · Item pills still create immediately rather than routing through the name page — "one tap creates and opens it" is the point of that surface, and the new dialog is one row above it. The template `description` msgids were left as they stand ("A door the player opens to travel to another map.") rather than rewritten into § 6.6's "Door — takes the hero to another map": that line is read as layout guidance for the grid, and the strings are shared with other surfaces, so a hero-voice copy pass over all ten belongs to the § 1 voice work, not to one dialog) |
| 6.4 | Game home: title card, Start, Rules with switch-off `Adw.AlertDialog`, About | brief: Game view; TODO "`combat-action` leaves three gaps" (c) | — done (the page stopped being a settings column: `game-view.blp` is an **`Adw.MultiLayoutView`**, the first use of that widget in this repo, whose `narrow` layout stacks title card · checkup · settings in one scrolling column and whose `wide` layout (≥ 1100 px) pins the title card and the checkup into a 360 px left column while the groups scroll on the right. Re-slotting moves the same three children between the two layouts, which is safe here for the reason `scene-editor.blp`'s header comment gives for the scene editor: nothing on this page holds a GL context. `Adw.PreferencesPage` is gone entirely — it accepts only `Adw.PreferencesGroup` children and an `Adw.LayoutSlot` is not one — so the groups sit in a plain box and the Checkup is a hand-rolled `heading` label over a `boxed-list` `Gtk.ListBox`, which nests in both layouts without the doubled margins an `Adw.PreferencesGroup` would bring into the left column. The **"Project" group dissolved**: the name became the title card's `Adw.EntryRow` under a cover, author and description moved into About, and `path_row` became an activatable **"Show game folder"** opened with `Gtk.FileLauncher.open_containing_folder` instead of a label nobody could act on. The **cover** is an `Adw.Bin` filled in code with `MapPreview.setFromResource(resource, startMapId)` and rebuilt only when `${resource.path}#${mapId}` changes, so a refresh for an unrelated field does not re-render the map; its `.game-cover` background doubles as the "no start map yet" placeholder. **Start** is two `Adw.ActionRow`s over two imperative pickers (`game-dialogs.ts`): the start-map picker draws each map's own 56 px thumbnail and ticks the current one, the hero picker lists characters, and in both the row IS the choice — no confirm button, because picking a start map is a one-field edit that undoes by picking another. The hero picker deliberately has no "nobody" row: clearing the hero is not something this page offers, so `setHero` takes a plain id. **Rules** is one `Adw.ExpanderRow` per switchable game system with the switch as its suffix, and the expander's subtitle now stacks three lines — the kid-facing label, `Adds: …` and `Needed by …` — so what a system brings is readable without expanding; `adds` is computed in `game-rules-model.ts` (`RULE_ADDS_MAX = 4`) from the system's own templates when it ships any (`combat-action` → "Enemy, Weapon") and from its components' editor labels otherwise. Switching one OFF while the project uses it opens the **`Adw.AlertDialog`** TODO (c) asked for — a plain alert, not `confirmDestructive`, because nothing is deleted: it counts what goes quiet ("3 objects stop using it, 12 of them placed on 2 maps.") and says the settings stay. Switching off something nothing uses asks nothing at all, and cancelling restores `enable-expansion` inside the view's `_loading` fence rather than letting the restore fire the callback again. The design's destructive **"Remove data" row was not built** and TODO (c) keeps that half: dormancy is the contract (`docs/concepts/game-systems.md` § Reach), and a row that deletes the data the dialog just promised to keep needs its own decision. The always-on systems are one collapsed "Built in" `Adw.ExpanderRow` inside a Full-view-only group — § 4.5 removed them from Simple view, and a Full-view author still deserves to see what is underneath. Row signals are connected in `vfunc_map` through `SignalScope` rather than as Blueprint `=> $handler` callbacks, matching every other `.blp` in this app, and the two pill buttons carry `Adw.ButtonContent` labels because an `accessible-name:` on a `Gtk.Button` in Blueprint makes GTK reject the whole template at run time. **"Export…" is skipped**, recorded in TODO.md: no export action exists anywhere in the app — `apps/game-browser` is only a seed — and `check:blp-actions` rightly blocks an `action-name` nothing backs) |
| 6.5 | Checkup group with deep links | — | — done (the checkup model is **pure, GTK-free and string-free**: `services/game-checkup.model.ts` emits FACTS — `ready` · `no-hero` · `no-start-map` · `door-goes-nowhere` · `more-doors` · `map-unreachable` · `more-unreachable` — and `widgets/game/checkup-list.ts` words them with `_()`, the same split `dormantComponentFacts` uses in 6.2. The reason is the same twice over: every row interpolates a map or door NAME, so a model returning finished sentences would either hard-code English or pull gettext into a unit test, and the interesting cases are all *absences*, which a fixture states and a running editor cannot. **Each row is the deep link** — no "Fix" button beside it — and the link is chosen per fact: no hero → `win.library-chip('characters')` (both wordings, "pick one" and "make one", end in the Characters gallery); a dangling door → `win.focus-placement([mapId, placementId])`, which lands on the door itself rather than on the map containing it; no start map → `win.new-map` when there is no map to pick and **no action at all** when there is, because the Start group one scroll below already answers it and the row opens that same picker; the overflow and unreachable rows → `win.back-to-atlas`, where every broken door is already drawn (§ 6.2). A repeating kind lists at most `CHECKUP_MAX_ROWS_PER_KIND = 5` rows and collapses the rest into one "and N more" — a project that broke forty doors at once needs one sentence, not forty rows. "Unreachable" is the spec's literal "no door leads to X": a local inbound-door check, not a transitive reachability walk, with the start map excluded and a self-door not counting as a way in — the wording promises exactly what is computed. A `playerActorId` that resolves to no character counts as "no hero" when the character list is supplied, because that is what it is. Severity is a look, not a word: problem → `dialog-warning-symbolic` + `.warning`, hint → `dialog-information-symbolic`, clean → a single `emblem-ok-symbolic` + `.success` "Ready to play" row. The checkup is derived read-only state and therefore has **no `Command` and no `__project/*` op of its own** (§ 8): everything it reads is already synced, so it re-derives itself on every store event the page listens to — including `maps-changed`, which the Game page did not subscribe to before) |
| 6.6 | Whole-sheet tileset thumbnails | brief: unreadable thumbnails |

**Phase 7 — Walls, packs, first run**

| # | Step | Resolves |
|---|---|---|
| 7.1 | Collision pictogram presets + Wall brush + "Show walls" (needs the engine to read `colliders[]`) | TODO "Per-tile collision-shape editor" (first half) |
| 7.2 | Custom shape dialog (Full view) | same (second half) |
| 7.3 | Starter packs shelf in its other three places (New-map dialog, Graphics empty state, "Add graphics"); further packs | same TODO as 3.6 |
| 7.4 | Stamp brush from a palette drag | new; needs engine support |
| 7.5 | Coach marks; new projects open their start map; Blank becomes "New game" and moves first — gated on H1 | brief: onboarding |
| 7.6 | Welcome: Continue card, single column, join-by-code dialog | `phone/01` |

**Phase 8 — Together**

| # | Step | Resolves |
|---|---|---|
| 8.1 | Together dialog (people, invite, stop) replacing the share icon and welcome-only session UI | brief: presence first-class |
| 8.2 | Peer location on atlas cards and Library rows; Follow | — |
| 8.3 | AI edits flash in its colour on every peer | TODO "Surface AI op attribution in the receiving peer's UI" (a) |
| 8.4 | Connection banner / OSD chip | — |

Not addressed here (stays in `TODO.md`): the animation timeline's remaining follow-ups, the
editing-pill width table, Flatpak GSettings schemas, in-game dialogue / inventory / audio
overlays.

---

## 10. Open risks to verify first

1. **Detents on `Adw.BottomSheet`.** ~~The widget offers `open`, `modal`, `sheet-height`,
   `can-open`, `can-close` and no detents.~~ **Resolved in 3.2, and the fallback is not
   needed.** `sheet-height` turned out to be read-only; `adw_bottom_sheet_size_allocate`
   measures the sheet child's *natural* height, so a `height-request` on that child is the
   detent control and there is no fight with the swipe tracker at all. Two things did have to
   change shape: the sheet child is a plain `Gtk.Box` rather than an `Adw.ToolbarView` (whose
   `[top]` sits in a `GtkWindowHandle`, and `should_force_drag` in `adw-swipe-tracker.c`
   claims every drag that starts on one), and the drag handle is ours rather than
   libadwaita's (theirs is an internal `can-target: false` `AdwGizmo`, unreachable from a
   template). Arithmetic in `sheet-detents.ts`, wiring in `SheetDetentController`.
2. **`modal: false` at Half.** Confirm that strokes reach the canvas above an open non-modal
   sheet and that the sheet does not dim. If not, Half becomes modal and the tile-pick flow
   collapses to Peek after each pick.
3. **Gesture arbitration.** `Gtk.GestureZoom` must claim two-contact sequences before the
   event bridge's pointer stream paints. Verify on a real touchscreen (the OnePlus 6 rig), not
   under Broadway.
4. **Nested stacks and the engine.** `root_stack` must keep `SceneEditorView` rooted while
   hidden; assert no `unroot` fires across a shell ↔ map switch. **Verified in Phase 2.1** on
   three fronts: `DebugStatus.sceneEditorRooted` reports the live parent/root pair,
   `scripts/smoke/drive.py`'s `enterleave` scenario calls `require_rooted()` on both sides of
   every map ↔ World switch (and `scripts/smoke-open-map.mjs` asserts it after each open), and
   `check:mode-routes` check 11 statically forbids the view from being anything but a direct
   `root_stack` page. The switch itself does tear the Excalibur instance down by design —
   `EngineController` disposes on leave and builds a fresh engine on the next open — the widget
   is what must never be reparented.
5. **`Adw.ViewSwitcher` inside an OSD pill** on the atlas: check contrast and that the pill's
   empty pixels do not need a `WindowHandle` (they must not get one that spans map).
6. **Contiguous palette, two-axis pan.** The sample's forest sheet is 32 × 32 tiles of 16 px:
   1536 px square at 3×. It must pan sideways inside a sheet that scrolls and drags vertically.
   Verify the gesture split on a touchscreen; the fallback is 2× (32 px targets, 1024 px wide)
   with pinch zoom in the palette.
7. **Widths.** Every new phone surface must measure ≤ 360 px; extend
   `phone-chrome.probe.spec.ts` to the three sheet pages, the contextual bar and the undo pill
   next to the Play FAB.
8. **The only bundled example is Nintendo-derived fan art.** It cannot supply starter tiles,
   Flathub screenshots or store art, and a Flathub reviewer may object to shipping it at all.
   Decide before Phase 7 whether the example stays in the bundle; H1's pack should be enough
   to build a small original example that can replace it.
9. **Whole-map cards reverse a shipped feature** ("Viewport scene-card previews", with the
   per-card lock). Get the owner's decision before step 5.3. If the section view stays, keep
   steps 5.2 and 5.6 anyway and anchor arc ends to the card edge nearest the door.
10. **The 80 px strip's cause is inferred from screenshots** (constant offset, backdrop
    colour, moves with the camera). **Checked in Phase 0: the diagnosis was wrong.** The
    editor camera sits at the map origin and the run camera is clamped by `lockCamera`. The
    strip is five empty tile columns (80 / 16) of `kokiri-forest.json`'s ground layer, which
    is not rectangular (9806 of 26048 cells empty), and the 72×88 block behind Stop is
    tile-aligned empty cells too. A camera clamp removes neither. The fix is map data or a
    map `backgroundColor`, a product decision; step 0.4 is not done.
11. **A new project today.** No screenshot shows `blank-starter`. Step 0.8 starts by capturing
    one; the empty-state design assumes the palette is simply empty.
