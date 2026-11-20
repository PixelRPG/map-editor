# Responsive Chrome — Sidebars, Breakpoints, Floating OSDs

> Status: tracked in [implementation status](#implementation-status) — the single source of truth.

The editor has five top-level views — `welcome`, `world` (the atlas),
`library`, `game`, `map` (the scene editor) — spread over **two**
nested stacks in `application-window.blp`: a `Gtk.Stack root_stack`
with `welcome` / `shell` / `map`, and inside the `shell` page an
`Adw.ViewStack shell_stack` with `world` / `library` / `game`. The
three shell pages are the switcher destinations (an
`Adw.ViewSwitcherBar` at the bottom on phone, an `Adw.ViewSwitcher` in
each view's header on wide); `welcome` and `map` are full-window pages
that take over instead. `check-mode-routes.mjs` holds the
`EditorMode` ↔ `ViewName` ↔ two-stack declarations together. On top of
that sits one window-level chrome
system that has to render acceptably from a 360 px-wide smartphone
form-factor up to a 4K desktop monitor. This doc is the high-level map of how that's stitched
together so the next contributor doesn't have to reverse-engineer
fifteen PRs to add a new view.

For the editor's **model + controller** architecture (ECS, session
singleton, intent emission), see [`editor-architecture.md`](editor-architecture.md).
This doc is purely about the **view** layer's chrome.

---

## Breakpoints — phone / desktop

Single source of truth: **one** `Adw.Breakpoint` on the
`ApplicationWindow` template (`apps/maker-gjs/src/widgets/application-window.blp`).

| Tier    | Condition                          | Setters apply                                                                                                     |
|---------|------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Phone   | `max-width: 767sp`                 | `view_switcher_bar.reveal: true` + `compact: true` on the three shell views (world, library, game) + `inspector-collapsed: true` on every view that has an inspector (library, scene-editor, welcome; the world view lost its inspector in step 5.4, game never had one) (the switcher bar stays up whatever is selected; the map selection bar floats over the canvas) |
| Desktop | (no breakpoint, template defaults) | `reveal: false` — the header switchers carry navigation; `compact: false`, `inspector-collapsed: false` — splits and the inspector persistent |

The **tablet** tier is gone (redesign step 2.1). It existed to
collapse the left mode rail while keeping the right inspector
persistent; with the rail deleted it had no setter left to apply.

`collapsed: true` on an `Adw.OverlaySplitView` flips the sidebar
from a persistent side-panel to an overlay drawer — opens with
the toggle button, dismisses on outside-tap, doesn't reserve
layout space.

### `compact` vs `inspector-collapsed`

Two independent booleans, on purpose. `inspector-collapsed` (right)
is a sidebar mode; **`compact`** is "this view is on a phone" — it
replaces the former `library-collapsed` (left) now that there is no
left sidebar to collapse. Each shell view reads it to hide its header
`Adw.ViewSwitcher` (the bottom `Adw.ViewSwitcherBar` has taken over)
and to pick its narrow layout. The scene editor does **not** take
`compact`: it runs its own canvas-width `Adw.BreakpointBin` (the
`stage` ladder below), which is a finer measure than the window's
width.

### Defaults

`show-inspector` lives on the **ApplicationWindow** (default `false`)
and is bound **bidirectionally** to the same-named property on the
atlas and the scene editor — so the state is **shared across view
switches** (toggle the inspector open in the atlas, switch to the
scene editor, it stays open). Library and Game are master-detail
splits with no inspector drawer, so they are unbound. Desktop users
open the inspector from its toggle pill (a headerbar button on atlas /
welcome; the end-aligned context pill's `inspector_toggle` on the
scene editor).

There is no `show-library` any more, and no `win.toggle-library`: step
2.1 deleted the left drawer on every view, so the window-level half of
the pair and the scene editor's `library_toggle` button went with it.

---

## Right inspector — auto-open policy

The right inspector is the **context surface**: it shows
information + settings about whatever the user just selected.
When a selection lands and inspector content becomes available,
the inspector **auto-opens** if it was closed.

The **world view is not in this table** since step 5.4: it has no
sidebar at any width. Selecting a map reveals a `MapSelectionBar`
instead — a floating pill bottom-centre over the canvas at every
width, above the phone's view switcher — so the map the user just pointed at stays in
view rather than being pushed aside by a drawer. See "The world
view's selection bar".

| View          | Triggering selection                                          | Inspector content                          |
|---------------|---------------------------------------------------------------|--------------------------------------------|
| Library › Graphics (tileset detail) | Click a tile in a tileset's palette     | Collision pictograms, surface combo (tile-property inspector); on phone it is a bottom sheet, see `tiles-view.ts` |
| Scene editor  | Click a placement with the `'select'` tool (canvas-side hit)  | Selected page fills with the placement — **wide only**, see below |

The scene editor is the one exception, and it is deliberate. On phone
the pages live in the bottom sheet, so "auto-open" would mean sliding a
sheet up over the placement the user just tapped — hiding the context
the move and copy verbs need. REDESIGN § 5.4 answers a selection in the
bottom bar's second row instead (the placement's name plus Edit · Copy ·
Move · 🗑), and the sheet opens only when the user asks for it with
Edit. `SceneEditorView.revealForSelection()` is where that split lives:
a no-op while `inspector-collapsed`, a plain `show-inspector = true`
otherwise. The unconditional reveals (`win.focus-placement` as a deep
link, `win.toggle-inspector`) keep going through `show-inspector` and so
still land on the sheet via `_onShowInspectorChanged`.

The Library's Characters and Things pages and the Game page follow
the content-view master-detail pattern (list → detail page, an
`Adw.NavigationSplitView` / `Adw.NavigationView` that collapses to a
drill-down at the same `inspector-collapsed` breakpoint) rather than a
separate inspector drawer. The Library host pushes `inspector-collapsed`
into the pages that have a split to collapse (`library-view.blp`); the
window's `show-inspector` is not bound to it, because nothing behind the
Library's header is a drawer.

The rule is one line per call site: `this.showInspector = true`
in the selection handler. The setter is a no-op when the panel is
already open, so re-firing on every click is cheap and the user
never sees a flicker.

**Why auto-open instead of leaving it to the user toggle.** The
inspector is the *reason* the click happened. Leaving it closed
hides the only configuration surface the click produced — the
user then has to discover the toggle button to see what they just
selected. The previous policy (no auto-open, shared state across
view switches) was abandoned because the "share inspector state
across views" half held value but the "never auto-open" half
created a hidden-UI dead end.

**When NOT to auto-open.**

- **Empty / null selection.** Clicking empty tile space with the
  `'select'` tool clears the selection (`placementId: null`) — no
  inspector content, no auto-open. Otherwise the sidebar would
  pop on every stray click on the canvas.
- **Selection that originated *inside* the inspector.** Picking a
  row in a list the inspector itself shows doesn't auto-open the
  parent inspector (it can't be both the source and the target) —
  animation-list and layers-page clicks.
- **Mutating-tool clicks.** Pencil / eraser don't select anything
  — they paint. No inspector content emerges, so no auto-open.
- **Eyedropper.** Auto-switches to pencil after a pick; no
  inspector content to show.
- **Drag-start selections.** A drag-and-drop motion (atlas card
  drag, future placement drag, etc.) DOES count as a selection
  for content-refresh purposes — the inspector mirrors the
  dragged item so a desktop user can read its metadata in the
  persistent panel — but it MUST NOT trigger auto-open. On
  smartphone widths the overlay drawer would cover the canvas
  the moment the drag begins, blocking the gesture. Implemented
  by emitting two distinct signals from the source widget:
  `<thing>-selected` (click → auto-open) vs.
  `<thing>-drag-began` (drag → content only). Atlas-canvas is
  the reference shape; future drag-capable surfaces follow the
  same split.

**Mobile behaviour falls out for free.** The window-level
`inspector-collapsed` breakpoint setter (`max-width: 767sp`) flips the
right `Adw.OverlaySplitView` into drawer mode. The same
`showInspector = true` write surfaces as an overlay drawer on
narrow widths and as a persistent panel on desktop — no
responsive branching at the call site.

**Anchored convention, not a shared widget.** The pattern is
expressed as a single setter call per call site, not a behavioral
mixin. A helper function or behavior class would add indirection
without saving code (the write is one line) and would obscure
*where* the trigger lives. The compile-time anchor is the
view's `show-inspector` property; the design anchor is this
section + the inline comments at each call site that point back
here.

---

## Right inspector — in-overlay close affordance

In overlay-drawer mode (`inspector-collapsed: true`, set by the
window breakpoint at `max-width: 767sp`) the right inspector can grow
nearly as wide as the window itself — its `max-sidebar-width`
shrinks once content lands on it. On a 360 px-wide phone
that leaves zero space for an "outside-tap-to-dismiss" target,
so the only reliable way to close the drawer has to be **inside**
the drawer. The scene editor sidesteps the question entirely: at
that breakpoint it has no drawer. `EditorPages` hosts the three
pages in the bottom sheet instead (see "The sheet's three
detents"), so `SceneEditorView._onShowInspectorChanged` turns
every reveal — `win.toggle-inspector`, `win.focus-placement`,
`win.edit-placement` — into `openSheet()` and puts
`show-inspector` back to `false`. Without that redirect the
drawer slides out over the map holding nothing, because its slots
are empty whenever the pages live in the sheet. A plain canvas
selection is the one reveal that does not arrive here at all: it
goes through `revealForSelection()`, which declines on phone (see
"Right inspector — auto-open policy"). The other two
inspectors still take the drawer on phone and close from their
own header.

Each of the three right-inspector widgets (`RightInspector`,
`CastInspector`, `TileInspector`) carries a
`collapsed: boolean` GObject property + a circular-flat close
button in the `[start]` slot of its flat headerbar. The button
binds `visible` to `collapsed` so:

- **Desktop** (`collapsed: false`) — button hidden. The
  panel is pinned, and `inspector_toggle` — in the scene editor's
  end-aligned context pill — is the expected
  close affordance. `CastInspector` / `TileInspector` sit in the
  Library's own master-detail splits rather than a window drawer, so
  there is no toggle for them.
- **Phone** (`collapsed: true`) — button visible. Click
  closes the drawer via the existing `win.toggle-inspector`
  `Gio.PropertyAction` (boolean property toggle, flips
  `show-inspector` to false).

The `collapsed` value is fed by a one-line `.blp` bind from each
parent view's `inspector-collapsed` property
(`collapsed: bind template.inspector-collapsed;`), so the close
button tracks the breakpoint without any TS-side glue. The three
inspector widgets are independent classes today (different
content surfaces, different signals); when a fourth inspector
lands, it copies the same six lines (property + getter + setter +
binding + .blp button + headerbar comment) — small enough that a
shared mixin would obscure more than it saves.

---

## Two chrome patterns

The editor lives on two different surface types, which want
two different chrome treatments:

### Canvas-bearing views (atlas, scene editor)

Floating OSD pills over the canvas. **No central headerbar.**
The headerbar would either cover canvas content (`extend-content-to-top-edge`
+ a transparent flat header) or steal vertical pixels from the
canvas — both worse than just letting the canvas occupy the
whole content area with chrome floating on top.

Layout shape — the atlas, whose overlay children are all direct:

```
Adw.ToolbarView               (extend-content-to-top-edge: true)
├─ [top] Adw.HeaderBar        (flat + .atlas-headerbar — translucent, the
│     canvas reads through it) switcher pill (wide) /
│     "World" title (phone) · RosterChip · "⋯"
└─ content: Adw.BreakpointBin (measures the CANVAS, not the window)
   └─ Gtk.Overlay
      ├─ [overlay] overview minimap (top-right, only while the world
      │                              is larger than the view, never compact)
      ├─ [overlay] FloatingFab      ("New map" → win.new-map, bottom-right)
      ├─ [overlay] FloatingZoom     (bottom-left, see below)
      ├─ [overlay] MapSelectionBar  (bottom-centre at every width; lifted
      │                              above the zoom pill / FAB on phone)
      └─ child: AtlasCanvas         (scene cards + teleport overlay)
```

Before step 2.1 this was a pair of nested `Adw.OverlaySplitView`s, the
outer one holding a `ModeRail` sidebar. The rail went with 2.1 and the
world view's inspector with 5.4, so the atlas has **no split left at
all** — the scene editor is the one canvas view that still wraps its
content in one, for the `RightInspector` drawer.

The scene editor puts a `SceneEditor` (`scene-editor.blp`) in the
same `content:` slot, and that widget owns its own overlay:

```
$PixelRpgSceneEditor
└─ Adw.BreakpointBin ladder      (measures the CANVAS, writes `stage`)
   └─ Adw.BottomSheet bottom_sheet   (inert on wide, docked bar on phone)
      ├─ content: Gtk.Overlay        (margin-bottom bound to the bar's height)
      │  ├─ child: backdrop (diagonal stripes) → engine_holder
      │  │     the canvas has ONE parent for the view's life
      │  │     (see "Engine widget lifecycle")
      │  ├─ [overlay] Gtk.WindowHandle → editing pill  (halign: start)
      │  │     back · undo · redo · ToolGroup ·
      │  │     BrushBadge + its label
      │  ├─ [overlay] back_circle "‹"   (phone only, top-left)
      │  ├─ [overlay] Gtk.WindowHandle → context pill  (halign: end)
      │  │     RosterChip · "⋯" · inspector toggle
      │  ├─ [overlay] history_pill  (phone only, bottom-left)
      │  │     undo · redo, in thumb reach above the docked bar
      │  ├─ [overlay] ZoomOsd        (bottom-centre, transient)
      │  ├─ [overlay] cursor_caption (bottom-left, Full view + wide only —
      │  │     the history pill owns that corner on phone)
      │  └─ [overlay] FloatingPlay   (bottom-right)
      │     (+ a Gtk.PopoverMenu parented to the overlay on first
      │      long press — pointed at the finger, so overlay
      │      coordinates and canvas coordinates must agree)
      ├─ bottom-bar: phone bar — ToolGroup + BrushBadge + RecentTiles
      └─ sheet: Gtk.Box sheet_view
            its `height-request` IS the sheet's height — see
            "The sheet's three detents"
         ├─ Gtk.Box sheet_grabber → Adw.Bin .sheet-grabber-pill
         │     our own drag handle: drag to resize, tap to cycle
         ├─ Adw.InlineViewSwitcher sheet_switcher
         └─ Gtk.ScrolledWindow sheet_scroller → Adw.ViewStack sheet_stack
               brush · layers · selected — three Adw.Bin slots the
               host fills from `EditorPages` (see below)
```

Two rules force that shape, and both are written out in
`scene-editor.blp`'s header comment:

1. **The canvas is never reparented.** The engine tears down in
   `vfunc_unroot`, so an `Adw.MultiLayoutView` — which re-slots every
   `Adw.LayoutSlot` child on a layout change — cannot hold it.
   `SceneEditor.setLayout` moves two small GL-free widgets
   (`ToolGroup`, `BrushBadge`) between slots instead.
2. **No single chrome layer may float over the canvas.**
   `gtk_widget_pick` returns before descending into a
   `can-target: false` widget, so one full-size chrome layer would
   either eat every stroke or make its own buttons unclickable. Every
   floating piece is its own `Gtk.Overlay` child.

The `Adw.BottomSheet` is present at every size and costs nothing on
wide: `reveal-bottom-bar: false` drives `bottom-bar-height` to 0 and
`can-open: false` disables the swipe tracker. It is a permanent
wrapper precisely so turning the phone layout on never changes the
canvas's parent.

libadwaita allocates a bottom sheet's content at FULL height and lays
the bar over it, so the bar would sit on top of the bottom of the map.
Binding the overlay's `margin-bottom` to `bottom-bar-height` docks it
instead: the canvas ends where the bar starts, and the shell's
bottom-edge gesture band lands on the bar rather than on paintable
tiles. The window's toasts need the same clearance, which is why
`SceneEditor` puts a `sheet-peeking` class on the *window* — the
`Adw.ToastOverlay` is this widget's ancestor, so a selector rooted
here could never reach a toast.

### The sheet's three detents

`Adw.BottomSheet` has two states — bar and open — and no detent API.
The design (REDESIGN § 5.2) asks for three: **Peek** (the docked bar,
which is the closed sheet), **Half** (the map still visible and
paintable above it) and **Full**. They are built on top, in two halves:

- **`sheet-detents.ts`** owns every number and every decision, and is
  GTK-free so all of it is a unit test: `detentHeight` (Peek = the bar,
  Half = `max(0.46 · height, 320)`, Full = `height − 56`, each clamped
  into `[bar, full]` so a short window cannot order them wrongly),
  `snapDetent` (nearest, ties to the shorter), `releaseDetent` (a fling
  of ≥ 400 px/s takes the next rung in its direction and never skips
  one, otherwise snap), `cycleDetent` for the tap, and
  `bottomInsetFor`.
- **`SheetDetentController`** (plain, not a `GObject`, the way
  `SceneEditorView` holds `EditorPages`) measures, applies and
  listens. `SceneEditor` keeps it as a field and re-exports only
  `detent`, `bottomInset` and a `detent-changed` signal.

Three findings shaped the GTK side, and none of them is guessable from
the widget's documentation:

1. **`sheet-height` is read-only.** `adw_bottom_sheet_size_allocate`
   measures the sheet child's *natural* height and allocates that. So
   a `height-request` on the child IS the detent control — no fight
   with the swipe tracker, no custom layout manager.
2. **The sheet child must not be an `Adw.ToolbarView`.** Its `[top]`
   slot sits inside a `GtkWindowHandle`, and the sheet's swipe tracker
   force-claims any drag that starts on a window handle
   (`should_force_drag`, `adw-swipe-tracker.c`) — a detent gesture
   there would never see one. Hence the plain `Gtk.Box`.
3. **libadwaita's drag handle is unreachable.** It is an internal
   `AdwGizmo` with `can-target: false`, parented outside our template,
   so no controller can be attached to it. `show-drag-handle` is off
   and `sheet_grabber` carries the gestures instead: a
   `Gtk.GestureDrag` that claims only once the finger has moved 4 px
   (well inside GTK's own 16 px threshold, so the ancestor tracker
   never gets the sequence) plus a `Gtk.GestureClick` that cycles. The
   strip spans the full width because it is the target; the pill's
   metrics are copied from `_bottom-sheet.scss` so it still reads as
   native.

A move between two *open* detents is spring-animated
(`Adw.SpringAnimation`, damping 1, stiffness 500, `clamp: true`);
crossing Peek is applied instantly, because that crossing is
closed↔open and libadwaita already animates it. Half and Full are
shares of the editor's height, so `vfunc_size_allocate` re-applies
them after a resize — with an equality guard in the apply, or a
`set_size_request` that changes nothing would queue a relayout for
ever.

Only **Full** is `modal`. At Half a stroke has to still reach the
canvas beside the sheet, which is the whole point of the rung.

**The camera ducks at Half, and only at Half.** A sheet covering the
bottom of the map means anything the camera centres has to be centred
in what is left, so `detent-changed` makes `SceneEditorView` call
`Engine.setViewportInset({ bottom })`. The arithmetic is the pure
`packages/engine/src/services/viewport-inset.ts`
(`insetCameraTarget` lifts a focus point by `bottom / (2 · zoom)`),
applied in `focusOnPlacement`. At Peek nothing is covered and at Full
nothing is visible to aim at, so both return 0. The inset is **host
state and never an operation**: a peer's sheet sits at its own detent,
so pushing this onto the op-log would drag their camera around.

`pin-sidebar: true` is **load-bearing**: without it, libadwaita
auto-resets `show-sidebar` to `false` as part of the
collapsed↔persistent transition — which defeats the
ApplicationWindow's persistent `show-inspector` state every time you
cross the phone breakpoint.

The window-close X **always** lives on the right sidebar's flat
header (never on the canvas's overlay). It's the only piece of
chrome the user expects to find by tradition; pinning it to the
inspector's edge keeps it discoverable while leaving the canvas
unobstructed.

### Content views (welcome)

Regular `Adw.HeaderBar` with toggles + window controls in their
conventional slots. **No floating-OSD here.** The welcome surface
is plain content (hero + CTAs + templates), not a canvas — the
mismatch of canvas chrome over non-canvas content adds noise
without the upside. See PR #63 for the swap-back to a regular
headerbar after experimenting with the floating pattern.

Layout shape:

```
Adw.OverlaySplitView outer_split
├─ sidebar (end): Gtk.ScrolledWindow with recents list
└─ content: Adw.ToolbarView
   ├─ [top] Adw.HeaderBar
   │     show-end-title-buttons: true   ← window-close X here
   │     [end] ToggleButton sidebar_toggle
   └─ content: Adw.Clamp → hero column
```

---

## The OSD pill pattern (canvas views)

Repeated across the scene editor's editing + context pills,
`FloatingZoom` (atlas), `FloatingPlay`, `ZoomOsd`, the cursor
caption and the atlas's inline toggle pills. A pill is a
`toolbar`+`osd`-styled `Gtk.Box` of buttons, aligned into a corner
of the overlay.

```blp
// WindowHandle gives empty space inside the pill (between buttons,
// outer padding) a window-drag affordance. Buttons inside bypass
// automatically — Gtk widget event semantics.
Gtk.WindowHandle {
  halign: start | end | center;
  valign: start | end | center;
  margin-…: 12;

  child: Gtk.Box {
    orientation: horizontal | vertical;
    spacing: 2;
    styles ["toolbar", "osd"]

    // …buttons, separators, action-bound widgets…
  };
}
```

Conventions:

- **One handle per pill, never one across the row.** The bar this
  replaced was a single full-width `Gtk.WindowHandle` with a spacer
  between its two clusters, so at 1280×800 roughly 570 px of visible
  map started a window drag instead of a stroke. Each pill wraps
  only itself; the gap between them is canvas.
- **Sidebar toggle position**: the right-sidebar toggle (`inspector_toggle`)
  always sits at the **rightmost** slot of whatever pill hosts it
  (PR #52). Position on screen visually maps to the side it
  controls. It is the only sidebar toggle left — the editing pill's
  leftmost slot used to hold a mirroring `library_toggle`, which step
  2.1 removed with the left drawer.
- **Only pills with empty pixels wrap.** `FloatingPlay` is a single
  big button, so there is nothing to drag from; `ZoomOsd` and the
  cursor caption carry no controls at all. `ZoomOsd` additionally
  sets `can-target: false`, because a `Gtk.Revealer` on a crossfade
  transition keeps its allocation while hidden and would otherwise
  swallow strokes aimed at the canvas behind an invisible widget.
- **Margins**: 12 px from the nearest edge. Top pills + bottom
  pills clear each other; left + right clear the sidebars when
  the sidebars are persistent.
- **Feedback is transient, furniture is permanent.** `ZoomOsd`
  reveals the percentage at the bottom centre for 1.2 s after a
  change and fades; the standing cost is zero pixels. The pill it
  replaced held ~10 300 px² of the bottom-left corner at every window
  size for three buttons consulted between tasks. `FloatingZoom`
  survives for the atlas, where the buttons are the only *visible*
  zoom affordance; the scene editor drives zoom from `+` / `-` /
  `<Primary>0`, the wheel (`CameraControlSystem`) and three "⋯" items
  instead. The atlas additionally takes pinch (`Gtk.GestureZoom` on
  its scroller) and Ctrl+scroll, so a phone can zoom the world by
  touch; the scene editor's canvas has no pinch gesture yet, so there
  a phone has the "⋯" items and nothing else.

---

## The world view's selection bar

The world view answers a selection with a bar, not a sidebar
(REDESIGN § 5.4). `MapSelectionBar` (`packages/gjs`) is a one-row
`Adw.Bin`: the map's name, a `176 × 148 · 2 doors` caption under it, an
Open button and a "⋯" menu (Rename… · Duplicate · Start the game here ·
Map settings… · Delete). It carries no editing controls of its own —
every button is `action-name`-bound, so the bar is a view over the `win.`
map actions and holds no state the window does not already have.

**One instance, every width.** `selection_bar` is the 4th overlay child in
`atlas-view.blp`, bottom-centre, `floating: true`. On phone `AtlasView`
lifts it (`margin-bottom` 72) above the zoom pill / FAB row, and the
window's `Adw.ViewSwitcherBar` stays revealed beneath it, so the way out
of World is never replaced. Its buttons are 44 px (`map-selection-bar.css`).
Selecting a card on phone also scrolls it clear of the pill
(`AtlasCanvas.revealAboveBottom`, pure `scrollClearOfBottom`).

**Deselecting.** A tap on empty backdrop (pure `isTap`, 8 px slop) or
Escape clears `AtlasCanvas.selectedId` and emits `scene-deselected`;
`Open` in the pill is the path into a map, the card's double-click is only
a shortcut.

**The bar outlives the surface.** `win.map-list` swaps
`atlas-view.blp`'s `surface_stack` between the card grid and a
`Gtk.ListBox` of the same maps, and the selection bar and the "New map"
FAB stay up across the swap — both mean the same thing on either
surface. The zoom pill and the overview minimap go away with the grid,
being cameras onto a surface that is no longer on screen. The list is
one `Adw.ActionRow` per map (56 px thumbnail · name · the same caption),
reachable from the context pill's "⋯" at every width and from `Ctrl+L`;
it is the keyboard- and screen-reader-first path to the maps, which is
why it has no standing control of its own.

Why a bar at all: the thing the user just pointed at is on the canvas,
and a right drawer at 768sp takes a third of the canvas width away to
describe it. Captions degrade instead of wrapping — `max-width-chars`
18 (name) / 22 (caption) keeps the bar near 290 px, which fits the
360 px phone floor with the margins.

**Clicking the backdrop pans; it does not deselect.** The atlas has no
deselection path, so the bar stays up once a map has been picked. That
is deliberate for now (the verbs stay reachable), not an oversight.

---

## Connections draw above the atlas and listen through it

`TeleportOverlay` is the `[overlay]` child above the canvas's
`Gtk.Fixed`, and it is `can_target = false`: a full-size widget that
took events would sit between every card and the pointer. So it draws,
and `AtlasCanvas` does the listening — a `Gtk.EventControllerMotion`
and a `Gtk.GestureClick` on the **surface**, whose coordinates are
already the surface coordinates the overlay paints in. The canvas
pushes three things the overlay cannot observe: the hover point, the
zoom, and the visible region (from both scroll adjustments *and* the
layout pass, since scrolling moves the viewport with no layout
running).

Two consequences for the tiers:

- **Hover is a pointer affordance only.** A line names its far end
  while it is hovered or while it touches the selection. Touch has no
  hover, so on phone and tablet the selection is the only way to get
  a label — which is why selecting a card lights its lines rather
  than only its card.
- **The edge chip is the touch target.** Where a line leaves the
  viewport the overlay draws a `→ Name` chip clamped inside the
  visible region; pressing it pans to that map and claims the
  sequence, and the backdrop pan denies itself over a chip for the
  same reason. The chip is a comfortable tap target at every zoom,
  unlike the 2 px line it belongs to.

---

## The scene editor's disclosure ladder

Unlike the rest of the chrome — which reacts to
`ApplicationWindow`-level breakpoints — the scene editor carries its
**own** `Adw.BreakpointBin` (`ladder` in `scene-editor.blp`) watching
the **canvas** width, not the window's. The room the pills actually
get is `window width − the persistent inspector`, which varies with
the tier AND with the user's show-inspector state; watching the window
mis-estimates it by hundreds of pixels. It is also why the scene
editor takes no `compact` setter from the window breakpoint.

The **critical gotcha** is why the ladder is shaped the way it is:
`Adw.BreakpointBin` activates **one** breakpoint at a time. It
iterates its breakpoints in **reverse**, breaks on the first match,
and applies only that breakpoint's setters (see
`adw-breakpoint-bin.c:421-428` in the libadwaita source — the loop
reads `for (i = priv->breakpoints->len; i-- > 0;)` and `break`s once
one matches). Setters do **not** stack, so every rung has to declare
its complete visible set. Writing that out as `visible:` setters five
times is how the bar this replaced ended up with two full button
hierarchies and an overflow menu rebuilt from button visibility.

So the ladder sets exactly **one** property — `stage`, a string — and
`packages/gjs/src/widgets/editor/chrome-stages.ts` turns
`(stage, layout, playing, picking)` into every flag:

| Rung | Canvas ≥ | What it adds |
|---|---|---|
| `tight` | 0 px | badge only — no tool group (the inspector open on a small desktop) |
| `compact` | 672 px | the `Adw.ToggleGroup` tool chooser |
| `normal-1` | 768 px | the map name beside the back arrow |
| `normal-2` | 880 px | the brush sentence beside the badge ("Paint · Ground") |
| `roomy` | 1176 px | verbs beside the six tool icons |

Three things about those numbers:

- They are **measured** — `measure()` on the real pills with the
  package stylesheet loaded, which `phone-chrome.probe.spec.ts` reads
  back on every display-backed run — not derived per button. The
  design's §2.4 arithmetic lands low at every rung — 604 / 664 / 784 /
  1124 against measured pills — because a labelled `Adw.Toggle` is
  wider than the sum of an icon and a word; and the first measured set
  (656 / 704 / 856 / 1136) was 8 px low again below `normal-2`, because
  both pill tables had been read 8 px short. The probe pins the UI font
  to GNOME's default, "Adwaita Sans 11", so the two rungs with text in
  them read the same on a workstation, under Broadway and in CI. The
  numbers move whenever the pill gains or loses a control, and the probe
  is what notices: dropping the library toggle (step 2.1 — the library
  became a shell destination) took 42 px off the editing pill at every
  rung and the whole ladder down from 720 / 808 / 920 / 1224.
- They assume a **roster in the context pill** (192 px, versus 186 px
  solo — the window controls are part of both). The AI assistant joins whenever an agent drives the editor,
  so with-roster is the common case; keying on the solo width means
  the pills overlap the moment anyone joins. The two numbers used to be
  192 and 150, because the chip hid itself while the roster was empty;
  redesign step 8.2 made it an always-present invite button, so the only
  difference left is an icon versus an avatar and `solo` was
  **re-measured** through `phone-chrome.probe.ts` rather than adjusted by
  hand.
- `effectiveStage(proposed, canvasPx, contextPillPx)` demotes further
  when the pills still would not fit — a roster of three is wider than
  a roster of one, and no width table can know that. `SceneEditor`
  re-runs it on the chip's `notify::roster-size`.

Two invariants the spec pins, because the layout this replaced broke
both: **undo is reachable at every stage and in both layouts** (the
old ladder pushed it into an overflow menu below 460sp, which on a
phone put the only undo on touch two taps deep), **redo is offered in
exactly one place** (the pill on phone, the editing pill or "⋯" on
wide — two visible redos is a bug the spec catches), and **the armed tool
is nameable at every stage** — where the tool group is hidden the badge
still carries the tool's icon and its popover opens with the group.
Below `roomy` the verbs are gone, so the keyboard is an expert's
fastest route to one: V B G E I O arm the six tools, `+` / `-` /
`<Primary>0` drive the zoom, and `win.show-help-overlay` lists them
in an `Adw.ShortcutsDialog` built from `SHORTCUT_SECTIONS`
(`apps/maker-gjs/src/actions/accels.ts`) — one table, so the dialog
cannot advertise a key the window does not bind.

`chrome-stages.ts` is GTK-free, so both invariants
are unit tests (`chrome-stages.spec.ts`) rather than five blocks of
Blueprint a reader has to diff by eye. The two declarations of the
thresholds — the `.blp` conditions and `STAGE_MIN_CANVAS_PX` — are
held together by `scripts/check-chrome-stages.mjs`, which also refuses
conditions out of ascending order (reverse iteration means the widest
rung must come last).

### Wide ↔ phone

The layout switch is a different axis from the ladder and hangs off
`inspector-collapsed` (`max-width: 767sp`). `SceneEditor.setLayout` moves two
widgets and flips three flags:

- the `ToolGroup` from the editing pill into the phone bar's first row
  (and from six tools to four: Paint · Fill · Erase · Select — Pick is
  the long press, the object brush is armed by choosing a Thing);
- the `BrushBadge` from beside its label into the bar's button, at
  44 px instead of 32.

The three inspector pages switch host on the same axis, but they are
not `setLayout`'s business. `EditorPages`
(`packages/gjs/src/widgets/editor/editor-pages.ts`) owns ONE
`BrushPage`, `LayersPage` and `SelectedPage`, and `host(slots)` parents
them into a `PageSlots` triple. `SceneEditorView` holds the instance and
calls `host()` with `RightInspector.pageSlots` on wide and
`SceneEditor.pageSlots` on phone, so "which plane, which layer, which
tile" has one implementation rather than an inspector copy and a sheet
copy that drift. The same reason retired the badge's popover: the wide
badge is now a plain button on `win.sheet-page('brush')`.

The editing pill itself is gone on phone: only a circular "‹" remains
top-left (the system back gesture is shared with the shell, so it is a
bonus, not the contract), undo and redo move into their own OSD
history pill in the bottom-left corner, a thumb's reach above the
docked bar — never into "⋯", because they are the only undo and redo
on touch — and the sheet's docked bar carries the tools, the badge and
a recent-tiles strip. The pill costs that corner: `cursor_caption`
reads a pointer the phone does not have, so it is wide-only and the
two never stack. While a phone run is on, the bar, the FAB and the
"‹" all give way and the context pill becomes Stop · Restart: during a
run the finger is the joystick, not a brush.

**A run takes the editing affordances away on wide too**, because the
one run `win.play` can start is a *Test* run by the engine's own
markers — `applyRuntimeMode` removes `EditorModeComponent` as it adds
`RuntimeModeComponent`, and `EditorMode` is what "the tools are live"
means. So wide drops the editing pill with its tool group, undo/redo
and badge label, puts the inspector away (`SceneEditorView.setPlaying`
remembers the pre-run value, because `inner_split` is `pin-sidebar`
and the user's choice has to survive the run), keeps ↺ Restart in the
context pill, and turns the FAB itself into Stop — which is why
`stopButton` is phone-only while `restartButton` holds in both
layouts: the FAB has one verb to spare, not two. The canvas gains an
accent frame (`runBorder`, the `run_frame` overlay child) so a wide
window without the chrome still reads as *running* rather than as an
editor that lost its tools. The frame is **its own `can-target: false`
overlay child above the canvas**, not a style on the backdrop: GTK
draws a widget's border under its children and the engine canvas fills
the backdrop, so a frame there is invisible the moment a map is
loaded — and it would take 4 px off the GL area at Play and give them
back at Stop, resizing the engine for a decoration. It is the one
full-size layer the "no chrome layer over the canvas" rule allows,
because it has nothing to click.

§4.6's wide *Live* Run — the Mario-Maker move, where the tools stay
because both markers are present — needs a second entry point and an
engine that adds the runtime marker instead of swapping it. Neither
exists yet; `TileEditorSystem.isEditingLive()` is already written for
it, and a pill whose tools the engine has switched off would be the
worse half of the two (tracked in `TODO.md`).

### `picking` — the third chrome stage

`chromeFlags` takes a fourth input, `picking`, for §6.2's **pick
mode**: the person has asked where a door leads, the target map is
open, and the next tap on the canvas is the arrival tile, not a brush
stroke. It is the same shape of state as `playing` — the editor is
momentarily not an editor — and it is handled the same way rather
than as a modal dialog over the canvas, because the thing being
chosen is *a place in the map*, which is only legible at full size.

A pick removes everything `playing` removes **plus the Play FAB and
the "⋯" button**, and adds exactly one piece of chrome: `pickBanner`,
an `[overlay]` `Gtk.Box pick_banner` (`toolbar` + `osd`) carrying
`map-symbolic`, "Tap where the hero arrives" and a flat Cancel. The
two extra removals are not symmetry for its own sake — starting a run
from the target map would leave a pick armed behind a runtime that
cannot consume it, and the overflow menu's verbs all act on an editing
state the canvas is not in. The tool group and the badge go for the
plainer reason: the tap belongs to the pick, so offering a brush would
be offering an action the canvas will not perform.

Three consequences worth knowing:

- **Cancel is a signal, not `win.back-to-atlas`.** The host owes the
  person the map they came *from*, which the pick banner cannot know
  — `SceneEditor` emits `pick-cancelled` and the window navigates. The
  same path runs when they leave the map by any other route
  (`DoorTargetFlow.abandon` from `_leaveMap`), so navigating away
  cancels a pick for free: the arming lives on the target scene as a
  `PendingArrivalPickComponent`, exactly like `pendingPlacementMove`.
- **`setPicking` collapses the phone sheet**, for the same reason a run
  does: the sheet rests over the tiles the finger has to reach.
- **The banner takes no toast clearance.** `_applyToastClearance`
  excludes `picking` — a toast and the banner share the bottom edge for
  at most the moment before the tap lands, and lifting the banner for
  it would move the one instruction on screen.

The entry points are three and they converge on one road:
`win.door-target`, the canvas placement menu's "Goes to…" (appended
only while the selection is a door) and the *Selected* page's "Goes
to" row all reach `SceneEditorView.requestDoorTargetForSelection()`,
which emits `door-target-requested`. The window's `DoorTargetFlow`
answers it with the map picker, and only then arms the pick.

**Everything under the ladder fits 360 px, and that is nobody's job
but its own.** The ladder's `Adw.BreakpointBin` sets the floor with
`width-request: 360` and enforces nothing: a breakpoint bin ignores its
child's minimum, so a child that wants more is allocated past the
window's edge from x=0 — one `Adwaita-WARNING` in the log, and every
end-aligned piece (context pill, Play FAB, the badge) pushed off the
right. Two rules follow, both measured by `phone-chrome.probe.spec.ts`
with GTK's `measure()` rather than by eye:

- The **sheet's minimum is the wider of its page and its bar, at all
  times.** `Adw.BottomSheet` keeps both in one homogeneous `Gtk.Stack`,
  so the Brush page's width reaches the docked bar and the canvas with
  the sheet closed, and every one of the three pages has to clear that
  floor, not just the Brush page. Its Things palette therefore `wrap`s
  with six columns as the cap (one column minimum, six natural) and its
  plane-chip captions ellipsize: six pinned
  columns measured 378 px and put the whole editor 18 px past a 360 px
  window. The tile sheet is the one child that reports its natural size
  as its minimum — a scaled texture squeezed to 360 px would be a
  misdrawn tileset, not a narrow one — so it sits in a
  `Gtk.ScrolledWindow` that absorbs that minimum and pans instead,
  which is the same reason the tileset chips are `can-shrink: false`
  inside a scroller of their own. The Layers page clears the floor with
  three 44 px targets per row (eye, lock, "⋯") because the layer name
  beside them is a `Gtk.Inscription`-style ellipsizing label, not a
  width the row demands; those targets are unconditional rather than
  phone-scoped — a row that changed height with the tier would change
  the sheet's content height, which is an input to its detents. The
  phone sheet is 360 px wide and has room for all of it; the WIDE
  inspector did not, so its floor rose from 280 px to 320 px when the
  row menu landed. Everything in the row except the name has a natural
  width, so the name gets the remainder, and at 280 px the remainder
  was ~30 px — every layer read "De…". The tablet still clears the
  canvas floor at 320 (768 − 320 = 448).
- The **recent strip shows a whole number of tiles** — six at 360 px —
  and hides the rest; a swatch sliced by the edge of the bar reads as
  a defect, not as "more". `RecentTilesLayout` decides the count at
  every allocation from the real button widths and reports one swatch
  as the strip's minimum. The bar's buttons are 44 px OUTER targets:
  GTK's `min-width` is the content box, and `44px` plus Adwaita's
  padding had made 64×54 px buttons, a 127 px bar, and five tiles
  where six fit.

---

## Size-propagation hazards (and the fixes)

GTK propagates child minimum widths up through the layout tree.
If anything in the engine's content path declares a hard floor
(via `width-request`, `set_size_request`, or a `Gtk.Fixed`
positioning children at large coords), that floor bubbles all
the way up to `AdwToastOverlay` as the application window's
minimum — blocking the responsive breakpoints from ever firing.

Symptom: `AdwToastOverlay … exceeds ApplicationWindow width:
requested 1202 px, …` log warnings at narrow viewports, with
the lower breakpoints visibly never engaging.

The scene editor has a second, quieter form of the same hazard: its
ladder is an `Adw.BreakpointBin`, which **stops** the propagation at
`width-request: 360` — so the window still shrinks to 360, and a child
that wants more is not refused but allocated past the edge, with an
`AdwBottomSheet … exceeds AdwBreakpointBin width: requested 378 px,
360 px available` warning as the only trace.

The fixes that turned out to matter:

| Location                          | Fix                                                                                                                                                                                  | PR  |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| `atlas-canvas.blp` ScrolledWindow | `min-content-width: 1` + `min-content-height: 1` detaches the inner `Gtk.Fixed` surface's `set_size_request(W, H)` from propagating upward                                           | #54 |
| `engine.blp`                      | Wrap `canvasContainer` in a `Gtk.ScrolledWindow` with `min-content-{width,height}: 1` + `hscrollbar-policy: external` (size-detach only, no scrollbars). Same trick, different layer | #57 |
| `welcome-view.blp` recents column | Inner `Gtk.ScrolledWindow` gets `min-content-width: 1`. Dropped the `width-request: 320` floor on the recents column                                                                 | #60 |
| `application-window.blp` `root_stack` + `shell_stack` | `hhomogeneous: false` + `vhomogeneous: false` on **both**. Default `true` measures **every page** and uses the max as the stack's size — the scene editor's WebGL canvas leaked into the atlas view's layout | #55 |
| `brush-page.blp` palettes | `wrap: true` + `wrap-cap: 6` instead of `columns: 6`. `Adw.BottomSheet`'s page and bottom bar share one homogeneous `Gtk.Stack` (not ours to configure), so the closed sheet's minimum is the page's: six pinned 54 px columns were 378 px, and the ladder's `Adw.BreakpointBin` — which ignores its child's minimum — allocated the whole editor 18 px past a 360 px window. Caught by `phone-chrome.probe.spec.ts`, not by any log anyone read | this PR |
| `action-direction-matrix.ts` cells | `ellipsize: END` + `max-width-chars: 18` on the per-cell "N frames · Σms" caption. The grid is `column-homogeneous` over five columns, so one ~112 px unbreakable caption set a 5 × 112 + 4 × 8 = 592 px floor — 640 px with the detail pane's margins. Ellipsized, the cell's floor is its 48 px thumbnail | this PR |
| `cast-view.blp` detail pane | `Adw.BreakpointBin` (`max-width: 420sp`) stacks `detail_header` (180 px preview + a `title-1` name that cannot wrap mid-word = 357 px) and `detail_actions` (two labelled pills = 352 px), and drops the preview to 128 px. The pane's `hscrollbar-policy: never` propagates its minimum straight to the window, so before this the WHOLE cast detail was clipped at 360 px, not scrolled | this PR |
| `atlas-view.blp` bottom OSDs | `Adw.BreakpointBin` scoped to the canvas drops `new_map_fab` to its icon below 400 px. The zoom pill (233 px) and the FAB (103 px) are independently aligned overlay children of one `Gtk.Overlay` — nothing makes them aware of each other, so at 360 px they overlapped. It also hid a centred `legend_chip` below 624 px until the phase 0 chrome pass removed the legend outright | this PR |

If you add a new view: keep its minimum-size profile in mind.
A `min-content-width: 1` on the outermost ScrolledWindow is
usually all that's needed. Validate by dragging the window to
360 px and watching the log.

---

## Touch input on the canvas

Touch is handled by `@gjsify/event-bridge`, not by this repo.

`Gtk.EventControllerMotion` — which the bridge derives
`pointermove`/`mousemove` from — is driven only by the logical pointer;
a finger produces `GDK_TOUCH_UPDATE`, never `GDK_MOTION_NOTIFY`.
Measured on a OnePlus 6 (postmarketOS, GTK 4.22): a touch-drag session
produced 935 touch updates and **0** motion signals, against 42
`GestureClick::pressed`. Without a touch path the canvas therefore got
a press and a release with nothing in between, so
`PointerGestureSystem` never crossed `DRAG_THRESHOLD_PX`,
`CameraControlSystem` never received `POINTER_DRAG_MOVE`, and the map
could not be panned by finger. Tapping to paint still worked, which is
why it reads as "panning is broken" rather than "touch is broken".

gjsify solved this upstream in `feat(event-bridge): a finger is a
pointer too` (#1591): an `Gtk.EventControllerLegacy` feeds a
`TouchPointerTranslator` that emits one Pointer Events Level 3 stream
per contact, with touch contacts numbered from `pointerId` 2 so they
never collide with the mouse's 1.

**It shipped in `@gjsify/event-bridge` 0.49.0**, so the local-link
workaround this section used to describe is gone with it: 0.54.0's
`lib/esm/touch-pointers.js` is what npm serves, and `gjsify install`
puts it in place. The `scripts/link-local-gjsify.sh` shim that copied a
checkout's `event-bridge` over the registry copy was deleted in the same
commit that dropped the pin below 0.49.0.

### The two-finger gesture

One finger belongs to the pointer stream above; two fingers belong to
`attachPinchZoom` (`packages/gjs/src/widgets/engine/pinch-zoom.ts`), a
`Gtk.GestureZoom` on the canvas widget. It zooms about the midpoint
between the fingers AND pans by however far that midpoint travels, both
folded out of one `Gtk.Gesture::update` — two fingers that translate
rigidly never change the scale, so a pan hung off `scale-changed` would
not fire at all.

On `begin` the gesture takes `Gtk.EventSequenceState.CLAIMED`. GTK then
cancels the sequence for every other controller, the bridge turns that
into `pointercancel`, and `PointerGestureSystem` ends the one-finger
drag instead of feeding more deltas — which is both why a pinch does
not pan twice per frame and why a second finger cancels whatever one
finger had started.

On release the zoom springs to the nearest whole-pixel level (the
integers, and `1/n` below 1), measured in log space because zoom is
multiplicative. A pinch otherwise lands on an arbitrary fraction, and
16 px tiles resampled onto a fractional grid shimmer and lose their
one-pixel seams.

The arithmetic for all three lives in `touch-gesture.ts`, GTK-free and
unit-tested. **Touch cannot be injected into the headless harness** —
the capture script drives a pointer, so no screenshot can prove any of
this. The unit tests are the only proof these decisions get, which is
why they are a separate pure module rather than inlined in the
controller.

---

## Engine widget resize handling

`packages/gjs/src/widgets/engine/engine.ts` — `widget.onResize`.

Three rules that took several PRs to converge on:

1. **Skip 0-pixel allocations.** GTK fires resize events with one
   axis at 0 during the OverlaySplitView's animation between
   collapsed and persistent. Excalibur would happily reconfigure
   to a 0-pixel viewport, so we early-return on the 0 case.
2. **Don't touch `canvas.width` / `canvas.height` per event.**
   The spec (and gjsify's canvas wrapper) discards the WebGL
   framebuffer + clears every bound shader / texture / uniform
   on those property writes. Excalibur's initialised GL handles
   become dangling pointers; subsequent draw calls silently
   no-op and the user sees a permanently blank canvas
   (PR #64). Excalibur's `FillContainer` DisplayMode owns the
   canvas backing store — our job is only to nudge it.
3. **Frame-throttle to ~33 ms.** Gtk emits resize events ~60 / s
   during a drag or sidebar animation. Coalescing keeps the GL
   work bounded; the canvas's previous frame stretches over the
   new allocation until the next throttle tick (standard browser
   resize behaviour). PR #62 introduced this; PR #64 made the
   per-tick work safe.

The initial `canvas.width = widget.get_allocated_width() || 800`
in `onReady` is the **only** explicit canvas-size write we keep
— it gives Excalibur a sane backing store on first paint, before
its own DisplayMode logic runs.

---

## Engine widget lifecycle — `unmap` ≠ destroy

`packages/gjs/src/widgets/engine/engine.ts` — `vfunc_unroot`.

GTK4 fires `unmap` on **transient** invisibility too, not only on
destroy. The OverlaySplitView's breakpoint reflow unmaps the
scene-editor host's children mid-animation; the same happens during
view switches (atlas ↔ scene editor) while the outgoing view fades
out. Anything you tear down in `vfunc_unmap` runs once per transient
hide.

The Excalibur game loop in particular **never recovers** from a
teardown — `excalibur.stop()` calls `cancelAnimationFrame(id)` which
nulls the bridge's pending frame callback. Once the loop is dead it
stays dead until the next `excalibur.start()`. The visible symptom
is "map disappears at the breakpoint and stays gone forever,
even when the window grows back" (PR #66).

Rules:

1. **Teardown belongs in `vfunc_unroot`, not `vfunc_unmap`.** `unroot`
   fires on true removal from the widget tree (`parent.remove()`,
   `window.destroy()`), not on transient visibility flips. Same
   teardown logic; correct trigger.
2. **Stay out of `vfunc_dispose`.** `dispose` runs during GObject GC.
   Disconnecting signal handlers / cancelling sources from there
   triggers `"Attempting to run a JS callback during garbage
   collection"` criticals on app exit.
3. **Don't try to "save" state in `unmap` and restore in `map`** for
   expensive-init widgets like a WebGL game loop. The unmap can fire
   mid-frame; the re-init is racy and far slower than just keeping
   the engine running across transient hides. GTK's frame clock will
   pause render signals on the unmapped widget anyway — Excalibur's
   loop ticks on idle, no wasted GPU work.

If the underlying engine pause-on-hide really IS desired (e.g. for
battery), use `notify::mapped` to call a custom `pause()` / `resume()`
that ONLY toggles a flag — never call `excalibur.stop()` outside
final teardown.

(Companion bug in gjsify itself: `WebGLBridge.cancelAnimationFrame`
used to be a no-op-with-side-effect that always cleared the pending
frame callback regardless of id, so even a stale cancel from
anywhere killed the loop. gjsify#330 makes it spec-compliant
per-id; once gjsify is bumped to a release containing it, the
hostile-API edge is closed and the only remaining risk is your own
teardown firing too early — which the `unroot` rule above handles.)

---

## Sidebar drag regions

`Gtk.WindowHandle` wraps every sidebar's content so empty pixels
between rows / below the active page pick up window-drag gestures
(PR #53 + #54). Interactive widgets (ActionRows, buttons, list
items, search entries) consume their own clicks and bypass the
handle automatically.

The right inspector (RightInspector) wraps its
`Gtk.ScrolledWindow` content (the sidebar's own flat HeaderBar
is already a drag region by virtue of being an `Adw.HeaderBar`).

The welcome view's sidebar doesn't need a WindowHandle wrap —
the regular Adw.HeaderBar at the top of its content area gives
the user a familiar drag affordance, and the welcome sidebar
is dense enough (recents rows + tour CTA) that empty-pixel
dragging wouldn't be discoverable anyway.

---

## The back order

Back is five gestures — the header's back button, `Esc`, `Alt+←`, the
mouse's button 8, and the shell's own back — onto **one** decision.
That decision is a pure function, `resolveBackStep()` in
`apps/maker-gjs/src/services/back-order.ts`, reading a flat
`BackState`; `win.back` (`actions/back-actions.ts`) performs whatever
it returns. The precedence is REDESIGN § 3.4's:

| Step | When | Performed by |
|---|---|---|
| `stop-run` | a Live Run is playing | `ctx.stopRun()` |
| `collapse-sheet` | in `map`, the bottom sheet is expanded | `ctx.collapseSheet()` |
| `clear-selection` | in `map`, something is selected | `ctx.clearSelection()` |
| `pop-page` | the visible destination has a pushed detail page | `ctx.popPage()` |
| `leave-map` | in `map`, nothing of the above | `ctx.leaveMap()` |
| `none` | nothing left to undo | nobody — the event travels on |

The naming is the wiring: a step's performer is its camelCase
(`'stop-run'` → `stopRun`), so no lookup table has to be kept in step
with `BACK_STEPS`. `check:mode-routes` check 13 holds the two sides
together statically and fails on a step with no performer.

Two shapes of this are easy to get wrong:

- **`sheetOpen` and `hasSelection` are gated on `inMap`, `running` is
  not.** `shell_stack` and `root_stack` keep the scene editor's page
  alive across a switch, so an expanded sheet on a *hidden* editor
  would otherwise swallow World's back. A run, by contrast, owns the
  whole window while it lasts — back stops it from anywhere.
- **`Esc` and `Alt+←` are NOT in `WINDOW_ACCELS`.** An application
  accel for `Escape` wins over every popover, `Adw.Dialog` and
  `Gtk.Entry` in the window. They live in a separate
  `WINDOW_SHORTCUTS` table and are installed as a
  `Gtk.ShortcutController` in `Gtk.PropagationPhase.BUBBLE` by
  `ApplicationWindow`, so focused widgets get first refusal.
  `acceleratorFor()` searches both tables, which is what keeps the
  shortcuts window honest.

**The editor's visible back button is the one gesture that does NOT go
through this.** `back_circle` and the editing pill's arrow bind
`win.back-to-atlas`, which leaves the map unconditionally. REDESIGN
§ 3.4 argues the split: a labelled control has to do what it says, so
the steps in front of "leave" belong to the paths with nothing to
contradict — `Esc`, `Alt+←`, button 8, the shell gesture. The MCP
bridge's `back_to_atlas` and `scripts/smoke/drive.py` bind the
unconditional action too, which is also why the smoke `back` scenario
drives `win.back` explicitly rather than clicking the button.

Deep links are the other half of § 3.4: `win.open-object` /
`win.open-character` / `win.library-chip` push a Library page, and
`win.focus-placement(mapId, placementId)` opens a map *with* a
selection. Entering by link and pressing back must land where
navigating by hand would, which is why those actions push real pages
instead of swapping content, and why `focus-placement` parks the id in
`_pendingPlacementFocus` and lets `SceneNavigator`'s `onEngineReady`
drain it — a selection written while the scene is still loading lands
on the scene the load then replaces and vanishes silently.

---

## Adding a new view — checklist

0. Decide whether it is a new SWITCHER DESTINATION at all. Three
   destinations is the design (World / Library / Game, the
   `shell_stack` pages), and a place that is another lens over data a
   destination already owns is a chip page of that destination, not a
   fourth: Cast, Objects and Sheets were three of the same
   master-detail shape over the same entity library + sprite sets, and
   merged into `LibraryView` (`library-view.blp`: one host with the
   header + the chip switcher, an `Adw.ViewStack` of pages that carry
   neither). The gallery → detail split is the HOST's, once: one
   `Adw.NavigationSplitView` in `library-view.blp`, whose sidebar page
   carries the chip switcher + the per-chip galleries and whose content
   page carries the one detail header + the per-chip detail panes. A
   chip page is therefore an `Adw.Bin` gallery plus a detail pane, and
   declares no split, no header and no navigation of its own — the
   collapsed split is what gives the phone its single header and back
   button. A page that takes over the
   whole window instead of sitting beside the others (welcome, the map
   editor) is a `root_stack` page and gets no switcher entry.
1. Decide: canvas-bearing or content-only?
2. If canvas-bearing, follow the atlas-view template (one
   OverlaySplitView — the inspector's — wrapping a content
   Gtk.Overlay with floating OSD pills). Wrap each pill in its own
   `Gtk.WindowHandle`, never one across the row. If the pills have
   to disclose with width, put a `Adw.BreakpointBin` around the
   view's own content and let it write ONE property — the scene
   editor's `stage` / `chrome-stages.ts` split is the reference
   shape, and the reason is the reverse-iteration gotcha above.
3. If content-only, follow the welcome-view template (one
   OverlaySplitView + an Adw.ToolbarView with a regular
   HeaderBar on the content side).
4. Extend `ResponsiveEditorView`, which already carries `compact` +
   `inspector-collapsed` + `show-inspector` with `false` defaults and
   the `attachShellSwitcher()` hook; set `pin-sidebar: true` on every
   `Adw.OverlaySplitView` in the view. `ApplicationWindow`'s
   constructor binds its own `show-inspector` bidirectionally to the
   views that have an inspector drawer — so as long as the names
   match, the persistent shared state wires up automatically.
5. Give a shell destination the session pair at its header `[end]`:
   `$PixelRpgProjectMenuButton project_menu {}` first, then
   `[end] $PixelRpgRosterChip roster_chip {}` — declared in that
   order they render left-to-right as "roster chip · ⋯", the same
   pair the map editor's context pill shows. List `'roster_chip'` in
   `InternalChildren` so `ResponsiveEditorView._roster_chip` binds;
   the base class then handles `setCollaborators` /
   `setAssistantPaused` / `onParticipantActivated`, and
   `ApplicationWindow._rosterViews()` must grow the new view so the
   window's fan-out reaches it. Both halves are checked
   (`check:mode-routes` check 12 statically,
   `DebugStatus.rosterChipViews` at runtime) because **the chip hides
   itself on an empty roster**: a solo session — every screenshot and
   every smoke run — renders identically whether the chip is there or
   not, which is how three of four destinations lost it.
6. Add breakpoint setters for the new view in
   `application-window.blp` — mirror the existing per-view
   blocks (`compact: true` for a shell view, `inspector-collapsed:
   true` if it has one).
7. Add the view to `root_stack` or `shell_stack` in the application
   window template, and — if it is a shell destination — to
   `EditorMode`, `MODE_ORDER`, `ROUTE_FOR_VIEW` and `VIEW_FOR_MODE` /
   `MODE_FOR_VIEW`; `gjsify run check:mode-routes` fails until all
   declarations agree (it also requires an `icon-name` + a `title` on
   every shell page, since those are what the switchers render). The
   MCP bridge's `set_view` enum
   (`apps/mcp-bridge/src/tools/editing.tools.ts`) is a literal copy
   of `ViewName` that no guard covers: change it in the same commit.
8. Teach the back order about it (see [the back order](#the-back-order)).
   A view with a detail page needs `hasPushedPage()` + `popPage()`,
   and the `backState()` the window hands `installBackActions` must
   report them — otherwise
   back skips straight past the detail page to the destination.
9. Drag the window to 360 px and check the log for
   `exceeds ApplicationWindow width` warnings. If any:
   identify the bubbling child + apply the
   `min-content-width: 1` trick at the right ScrolledWindow,
   or remove the offending `width-request`.

---

## Anti-patterns we discovered the hard way

- **An empty `Adw.HeaderBar` with `extend-content-to-top-edge: true`
  blocks pointer events on the OSD pills underneath**. The bar
  exists invisibly but still claims its ~46 px event-target band
  (PR #50). If you want a transparent top with chrome floating
  in it, drop the headerbar entirely — don't try to make it
  invisible-but-present.
- **Setting `set_size_request(1, 1)` on the WebGL bridge widget
  to free up size propagation caused the canvas to render blank
  at mid widths** — the bridge's allocation collapsed to its
  minimum during certain layout passes. Use the
  ScrolledWindow-size-detach pattern (PR #57) instead.
- **Renaming gjsify's `esbuild:` config key to `bundler:` looks
  cosmetic but breaks `define` substitution + drops `loader`
  entries**. The keys aren't 1:1 — `bundler.transform.define`
  is the equivalent, and Rolldown's auto-inferred module types
  don't match esbuild's per-extension loaders. Stay on `esbuild:`
  until gjsify 0.5.0 ships migration notes (PR #58).
- **Tearing the engine down in `vfunc_unmap`** looks correct
  (mirror the "I'm going away" hook) but kills the Excalibur
  game loop on every transient breakpoint reflow — the canvas
  goes blank and stays blank because `excalibur.stop()` is
  permanent (PR #66). Move teardown to `vfunc_unroot` (true tree
  detach) instead. See the "Engine widget lifecycle" section
  above for the full lifecycle map and why GObject GC criticals
  rule out `vfunc_dispose` as well.

## Implementation status

| Scope | Status |
|---|---|
| Chrome architecture as described (breakpoints, sidebars, OSD pills, engine-resize handling) — ships in `apps/maker-gjs` | **landed** (PRs #48–#64) |
| Scene-editor chrome: two pills + Play FAB + transient zoom, the `stage` ladder, and the phone bottom sheet | **landed** |
| Scene-editor thresholds re-measured against real pill widths, with `check-chrome-stages.mjs` holding the two declarations together | **landed** |
| Phone bar + Brush sheet fit the 360 px floor; recent strip shows whole tiles; pill tables and ladder corrected by GTK measurement (`phone-chrome.probe.spec.ts`, run in CI under Broadway) | **landed** |
| Two-finger pinch + pan on the canvas, whole-pixel zoom snap on release, stroke cancel via the sequence claim (REDESIGN § 9 steps 1.1 / 1.2) | **landed** |
| Phone history pill: undo + redo as 44 px OSD buttons in the bottom-left corner, out of the context pill and out of "⋯"; two-finger tap undoes, three-finger tap redoes (REDESIGN § 9 step 1.3) | **landed** |
| Long press on the canvas: a paint tool picks the tile under the finger and the brush badge pops; `select` / `object` open a placement menu (Edit · Copy · Delete) at the finger (REDESIGN § 9 step 1.4) | **landed** |
| Navigation shell: `root_stack` / `shell_stack`, `Adw.ViewSwitcherBar` on phone and `Adw.ViewSwitcher` in the headers on wide, `ModeRail` + both left drawers + the tablet breakpoint deleted, `library-collapsed` → `compact` (REDESIGN § 9 step 2.1) | **landed** |
| Roster chip on all four destinations, not just the map editor's context pill; the chip's Follow click reaches the presence controller from every view (REDESIGN § 3.3 / § 9 step 2.2) | **landed** |
| One back order for all five gestures (`resolveBackStep`), `Esc` / `Alt+←` / mouse button 8 outside `WINDOW_ACCELS`, and `win.focus-placement` as a selection-bearing deep link (REDESIGN § 3.4 / § 9 step 2.3) | **landed** |
| Three movable inspector pages (Brush · Layers · Selected) owned by `EditorPages`, hosted either in the right inspector or in the bottom sheet, both driven by `win.sheet-page` (REDESIGN § 5.3 / § 9 step 3.1) | **landed** |
| Peek / Half / Full detents on the phone sheet: own drag handle, fling and tap, spring between open rungs, and the camera ducking at Half via `Engine.setViewportInset` (REDESIGN § 5.2 / § 9 step 3.2) | **landed** |
| Keyboard access to the detents, and a stepwise Full → Half → Peek on back (REDESIGN § 5.2) | deferred, tracked in `TODO.md` |
| The placement menu's "Goes to…" for doors, the *Selected* page's "Goes to" row and `win.door-target` — all three emit `door-target-requested`, and the §6.2 picker follows (REDESIGN § 5.5 / § 9 step 5.5) | **landed** |
| `picking` as the third chrome stage: the pick banner is the only chrome a pick leaves, Cancel is a signal so the host can return the map they came from (REDESIGN § 6.2 / § 9 step 5.5) | **landed** |
| A fifth pill for "Goes to" in the phone selection bar (REDESIGN § 5.4) — the row in the *Selected* page and the long-press menu carry it instead | deferred, tracked in `TODO.md` |
| One-finger drag paints a stroke (REDESIGN § 5.5) | deferred, tracked in `TODO.md` |
| On phone every inspector reveal lands on the sheet, never the editor's drawer (`_onShowInspectorChanged`) | **landed** |
| The *Selected* page edits a placement (name + component overrides, Duplicate, Delete) and the phone bar's second row becomes the contextual action bar — a canvas selection fills both and does NOT open the sheet (REDESIGN § 5.4 / § 9 step 3.3) | **landed** |
| Dragging the selected placement to move it; `Move` is a one-shot tap instead (REDESIGN § 5.4) | deferred, tracked in `TODO.md` |
| The *Brush* page is a `Tiles \| Things` toggle over the tileset drawn as one contiguous sheet, with the map's tilesets as chips above it and `win.select-tileset(s)` as the only way to change sheets (REDESIGN § 5.3 / § 9 step 3.4) | **landed** |
| A drag on the sheet picking a multi-tile stamp, and the "Search tiles…" row (REDESIGN § 5.3) | deferred / dropped, tracked in `TODO.md` |
| The *Layers* page gives every row a "⋯" menu (long-press / right-click too) with Rename · Duplicate · Move up · Move down · Move to plane ▸ · Delete, an "Add a layer" row per section (one row in Simple view), and 44 px eye / lock / "⋯" targets; the Things eye moved to the view menu as "Show Things" (REDESIGN § 6.3 / § 9 step 3.5) | **landed** |
| An explicit drag handle on a layer row — reorder stays a row-wide drag (REDESIGN § 6.3) | deferred, tracked in `TODO.md` |
| Virtual joystick + action button for a phone Live Run (REDESIGN § 5.6 / § 9 step 4.1) — overlay children of the *engine* widget, not of the editor chrome; a run on phone also collapses the sheet, so nothing rests over the thumb | **landed** |
| A run clears the editing affordances in the wide layout as well and frames the canvas in accent (`stopButton` / `restartButton` / `runBorder`, REDESIGN § 4.6 / § 9 step 4.2); `TileEditorSystem` gates its pointer handlers on `EditorModeComponent`, so a focus-seeking click during a run can no longer paint | **landed** |
| A wide *Live* Run that keeps the tools while the hero walks (REDESIGN § 4.6) — needs a second entry point and an engine holding both markers | deferred, tracked in `TODO.md` |
| The world view has no sidebar at any width: `SceneInspector` is deleted and a selection reveals `MapSelectionBar` instead — a floating pill bottom-centre over the canvas at every width, above the phone's view switcher (REDESIGN § 5.4 / § 9 step 5.4) | **landed** |
| List mode: `win.map-list` (context pill's "⋯", `Ctrl+L`) swaps `surface_stack` for a `Gtk.ListBox` of maps at every width; the FAB and the selection bar survive the swap, the zoom pill and overview minimap do not (REDESIGN § 4.2 / § 9 step 5.4) | **landed** |
| The list row's "peers present" column (REDESIGN § 4.2) | deferred, tracked in `TODO.md` |
| Atlas connections: the overlay draws (`can_target = false`) and the canvas feeds it hover, viewport and zoom; an edge chip is the tap target that pans to an off-screen map (REDESIGN § 6.2 / § 9 step 5.6) | **landed** |
| A press on a connection opens a popover naming both ends, with *Go to the door* per end, *Remove* and — on a broken one — the same `Goes to…` the scene editor's placement menu carries; the items are window actions with targets (`win.unlink-door` as `a(ss)` clears both ends of a pair, `win.fix-door`, and the existing `win.focus-placement`), so the canvas needs no wide signal (REDESIGN § 6.2 / § 9 step 5.7) | **landed** |
| Drag-to-connect: a press on a door handle re-aims the existing `scene-drag-*` stream instead of moving the card, so the expert path adds no competing gesture; only the selected map's outgoing doors grow handles, and a drop on the backdrop cancels (REDESIGN § 6.2 / § 9 step 5.7) | **landed** |
| A label on a line without a pointer — a tap now names both ends in the popover, but the on-demand label itself is still hover- or selection-driven | deferred, tracked in `TODO.md` |
| Deselecting a map in the world view: a tap on the backdrop or Escape | **landed** |

Cross-references:
- [Editor architecture](editor-architecture.md) — view-model-controller
  + ECS session-singleton (the underlying state model the chrome
  observes).
- [Object system](object-system.md) — what the inspectors render.
- [Runtime modes](runtime-modes.md) — how the chrome reacts to
  test-run / full-run toggles.
