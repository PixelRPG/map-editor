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
| Phone   | `max-width: 767sp`                 | `view_switcher_bar.reveal: true` + `compact: true` on the three shell views (world, library, game) + `inspector-collapsed: true` on every view that has an inspector (atlas, library, scene-editor, welcome; game has none) |
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

| View          | Triggering selection                                          | Inspector content                          |
|---------------|---------------------------------------------------------------|--------------------------------------------|
| Atlas         | Click a scene card                                            | Scene preview, metadata, Open Scene CTA    |
| Library › Graphics (tileset detail) | Click a tile in a tileset's palette     | Solid switch, surface combo (tile-property inspector); on phone it is a bottom sheet, see `tiles-view.ts` |
| Scene editor  | Click a placement with the `'select'` tool (canvas-side hit)  | Objects-tab row highlights, props          |

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
  row in the objects-tab list doesn't auto-open the parent
  inspector (it can't be both the source and the target). Same
  for animation-list / layers-tab clicks.
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
the drawer. The scene editor makes that the *only* way: the same
breakpoint switches its chrome to the phone layout, which drops
`inspector_toggle` from the context pill, so a drawer opened by
"Layers…" or by a placement selection is closed from its own
header.

Each of the four right-inspector widgets (`RightInspector`,
`SceneInspector`, `CastInspector`, `TileInspector`) carries a
`collapsed: boolean` GObject property + a circular-flat close
button in the `[start]` slot of its flat headerbar. The button
binds `visible` to `collapsed` so:

- **Desktop** (`collapsed: false`) — button hidden. The
  panel is pinned, and `inspector_toggle` — in the scene editor's
  end-aligned context pill, or the atlas header — is the expected
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
button tracks the breakpoint without any TS-side glue. The four
inspector widgets are independent classes today (different
content surfaces, different signals); when a fifth inspector
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
Adw.OverlaySplitView split   (pin-sidebar: true)
├─ sidebar (end): RightInspector / SceneInspector
│     (its own thin flat HeaderBar carries the window-close X)
└─ content: Gtk.Overlay
   ├─ [overlay] toggle pill      (top-right: inspector)
   ├─ [overlay] FloatingZoom     (bottom-left — atlas only, see below)
   ├─ [overlay] overview minimap (bottom-centre)
   ├─ [overlay] FloatingFab      ("New Scene", bottom-right)
   └─ child: scene-card area
```

Before step 2.1 this was a pair of nested `Adw.OverlaySplitView`s, the
outer one holding a `ModeRail` sidebar. The rail is gone, so there is
one split per view and it is the inspector's.

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
      └─ sheet: BrushPage
```

Two rules force that shape, and both are written out in
`scene-editor.blp`'s header comment:

1. **The canvas is never reparented.** The engine tears down in
   `vfunc_unroot`, so an `Adw.MultiLayoutView` — which re-slots every
   `Adw.LayoutSlot` child on a layout change — cannot hold it.
   `SceneEditor.setLayout` moves three small GL-free widgets
   (`ToolGroup`, `BrushBadge`, `BrushPage`) between slots instead.
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
  survives for the atlas, where the buttons ARE the whole zoom
  affordance; the scene editor drives zoom from `+` / `-` /
  `<Primary>0`, the wheel (`CameraControlSystem`) and three "⋯" items
  instead. There is no pinch gesture on the canvas yet, so a phone has
  the "⋯" items and nothing else.

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
`(stage, layout, playing)` into every flag:

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
- They assume a **roster in the context pill** (192 px, versus 150 px
  solo — the window controls are part of both). The AI assistant joins whenever an agent drives the editor,
  so with-roster is the common case; keying on the solo width means
  the pills overlap the moment anyone joins. A solo session reaches
  each rung ~42 px later than it strictly must, which nobody can see.
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
`inspector-collapsed` (`max-width: 767sp`). `SceneEditor.setLayout` moves three
widgets and flips three flags:

- the `ToolGroup` from the editing pill into the phone bar's first row
  (and from six tools to four: Paint · Fill · Erase · Select — Pick is
  the long press, the object brush is armed by choosing a Thing);
- the `BrushBadge` from beside its label into the bar's button, at
  44 px instead of 32;
- the `BrushPage` from the badge's popover into the bottom sheet, so
  "which plane, which layer, which tile" has ONE implementation rather
  than a popover copy and a sheet copy that drift.

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
Live Run the finger is the joystick, not a brush. On wide the same run
changes only the FAB's own icon.

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
  the sheet closed. Its palettes therefore `wrap` with six columns as
  the cap (one column minimum, six natural — the badge popover still
  sizes to six) and its plane-chip captions ellipsize: six pinned
  columns measured 378 px and put the whole editor 18 px past a 360 px
  window.
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
| `scene-inspector.blp`             | Drop the hard `width-request: 300`                                                                                                                                                   | #54 |
| `engine.blp`                      | Wrap `canvasContainer` in a `Gtk.ScrolledWindow` with `min-content-{width,height}: 1` + `hscrollbar-policy: external` (size-detach only, no scrollbars). Same trick, different layer | #57 |
| `welcome-view.blp` recents column | Inner `Gtk.ScrolledWindow` gets `min-content-width: 1`. Dropped the `width-request: 320` floor on the recents column                                                                 | #60 |
| `application-window.blp` `root_stack` + `shell_stack` | `hhomogeneous: false` + `vhomogeneous: false` on **both**. Default `true` measures **every page** and uses the max as the stack's size — the scene editor's WebGL canvas leaked into the atlas view's layout | #55 |
| `brush-page.blp` palettes | `wrap: true` + `wrap-cap: 6` instead of `columns: 6`. `Adw.BottomSheet`'s page and bottom bar share one homogeneous `Gtk.Stack` (not ours to configure), so the closed sheet's minimum is the page's: six pinned 54 px columns were 378 px, and the ladder's `Adw.BreakpointBin` — which ignores its child's minimum — allocated the whole editor 18 px past a 360 px window. Caught by `phone-chrome.probe.spec.ts`, not by any log anyone read | this PR |
| `action-direction-matrix.ts` cells | `ellipsize: END` + `max-width-chars: 18` on the per-cell "N frames · Σms" caption. The grid is `column-homogeneous` over five columns, so one ~112 px unbreakable caption set a 5 × 112 + 4 × 8 = 592 px floor — 640 px with the detail pane's margins. Ellipsized, the cell's floor is its 48 px thumbnail | this PR |
| `cast-view.blp` detail pane | `Adw.BreakpointBin` (`max-width: 420sp`) stacks `detail_header` (180 px preview + a `title-1` name that cannot wrap mid-word = 357 px) and `detail_actions` (two labelled pills = 352 px), and drops the preview to 128 px. The pane's `hscrollbar-policy: never` propagates its minimum straight to the window, so before this the WHOLE cast detail was clipped at 360 px, not scrolled | this PR |
| `atlas-view.blp` bottom OSDs | `Adw.BreakpointBin` scoped to the canvas hides the centred `legend_chip` below 624 px and drops `new_scene_fab` to its icon below 400 px. The zoom pill (233 px), legend (110 px) and FAB (103 px) are three independently aligned overlay children of one `Gtk.Overlay` — nothing made them aware of each other, so at 360 px the legend rendered underneath the other two | this PR |

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
between rows / below the active tab pick up window-drag gestures
(PR #53 + #54). Interactive widgets (ActionRows, buttons, list
items, search entries) consume their own clicks and bypass the
handle automatically.

The right
inspectors (RightInspector, SceneInspector) wrap their
`Gtk.ScrolledWindow` content (the sidebar's own flat HeaderBar
is already a drag region by virtue of being an `Adw.HeaderBar`).

The welcome view's sidebar doesn't need a WindowHandle wrap —
the regular Adw.HeaderBar at the top of its content area gives
the user a familiar drag affordance, and the welcome sidebar
is dense enough (recents rows + tour CTA) that empty-pixel
dragging wouldn't be discoverable anyway.

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
   neither). A chip page extends `LibraryPage` when it has a split to
   collapse, `Adw.Bin` otherwise, and keeps a header bar only on its
   DETAIL page (for the phone back button). A page that takes over the
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
8. Drag the window to 360 px and check the log for
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
| The placement menu's "Goes to… ›" for doors (REDESIGN § 5.5, needs the § 6.2 picker) | deferred, tracked in `TODO.md` |
| One-finger drag paints a stroke (REDESIGN § 5.5) | deferred, tracked in `TODO.md` |
| Bottom sheet's second page ("Selected" — object properties on phone) | deferred, tracked in `TODO.md` |
| Virtual joystick + action button for a phone Live Run | deferred, tracked in `TODO.md` |

Cross-references:
- [Editor architecture](editor-architecture.md) — view-model-controller
  + ECS session-singleton (the underlying state model the chrome
  observes).
- [Object system](object-system.md) — what the inspectors render.
- [Runtime modes](runtime-modes.md) — how the chrome reacts to
  test-run / full-run toggles.
