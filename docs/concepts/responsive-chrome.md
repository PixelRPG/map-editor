# Responsive Chrome — Sidebars, Breakpoints, Floating OSDs

> Status: tracked in [implementation status](#implementation-status) — the single source of truth.

The editor has five top-level views (welcome, atlas, library,
scene-editor, game — the `Adw.ViewStack` pages in
`application-window.blp`) behind three mode-rail rows (World = atlas +
scene editor, Library, Game; `check-mode-routes.mjs` holds the four
declarations of that mapping together) and one window-level chrome
system that has to render acceptably from a 360 px-wide smartphone
form-factor up to a 4K desktop monitor. This doc is the high-level map of how that's stitched
together so the next contributor doesn't have to reverse-engineer
fifteen PRs to add a new view.

For the editor's **model + controller** architecture (ECS, session
singleton, intent emission), see [`editor-architecture.md`](editor-architecture.md).
This doc is purely about the **view** layer's chrome.

---

## Breakpoints — mobile / tablet / desktop

Single source of truth: two `Adw.Breakpoint`s on the
`ApplicationWindow` template (`apps/maker-gjs/src/widgets/application-window.blp`).

| Tier        | Condition                              | Setters apply                                                                                         |
|-------------|----------------------------------------|-------------------------------------------------------------------------------------------------------|
| Mobile      | `max-width: 768sp`                     | `library-collapsed: true` + `inspector-collapsed: true` on every view (atlas, library, scene-editor, welcome*; game has no inspector) |
| Tablet      | `min-width: 768sp and max-width: 1023sp` | `library-collapsed: true` on every view with a rail (atlas, library, scene-editor, game)             |
| Desktop     | (no breakpoint, template defaults)     | All `*-collapsed: false` — both sidebars persistent                                                   |

\* Welcome view has no `library-collapsed` (no left sidebar there);
only the recents `inspector-collapsed` toggles.

`collapsed: true` on an `Adw.OverlaySplitView` flips the sidebar
from a persistent side-panel to an overlay drawer — opens with
the toggle button, dismisses on outside-tap, doesn't reserve
layout space.

### Why split into per-side properties

Each view exposes two independent boolean properties:
`library-collapsed` (left) and `inspector-collapsed` (right). The
tablet preset wants the **left** collapsed but the **right**
persistent — impossible to express with a single shared
`collapsed` flag, hence the split (PR #53).

### Defaults

`show-library` + `show-inspector` now live on the
**ApplicationWindow** (both default `false`) and are bound
**bidirectionally** to each view's same-named property — so the
state is **shared across view switches** (toggle the inspector
open in the atlas, switch to the scene editor, it stays open).
Desktop users open the sidebars they want from the toggle pills
(headerbar buttons on atlas / library / game / welcome; the two
floating pills on the scene editor — `library_toggle` in the
start-aligned editing pill, `inspector_toggle` in the end-aligned
context pill).

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
`inspector-collapsed` breakpoint setter (≤ 768sp — the tablet tier
collapses only the library) flips the
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
window breakpoint at ≤ 768sp) the right inspector can grow
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

- **Desktop / tablet** (`collapsed: false`) — button hidden. The
  panel is pinned, and `inspector_toggle` — in the scene editor's
  end-aligned context pill, or the central headerbar on
  atlas / library — is the expected close affordance.
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
Adw.OverlaySplitView outer_split   (pin-sidebar: true)
├─ sidebar (start): ModeRail  (or no sidebar in atlas's case)
└─ content: Adw.OverlaySplitView inner_split   (pin-sidebar: true)
   ├─ sidebar (end): RightInspector / SceneInspector
   │     (its own thin flat HeaderBar carries the window-close X)
   └─ content: Gtk.Overlay
      ├─ [overlay] toggle pill      (top-right: library + inspector)
      ├─ [overlay] FloatingZoom     (bottom-left — atlas only, see below)
      ├─ [overlay] overview minimap (bottom-centre)
      ├─ [overlay] FloatingFab      ("New Scene", bottom-right)
      └─ child: scene-card area
```

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
      │  │     library toggle · back · undo · redo · ToolGroup ·
      │  │     BrushBadge + its label
      │  ├─ [overlay] back_circle "‹"   (phone only, top-left)
      │  ├─ [overlay] Gtk.WindowHandle → context pill  (halign: end)
      │  │     RosterChip · "⋯" · inspector toggle
      │  ├─ [overlay] ZoomOsd        (bottom-centre, transient)
      │  ├─ [overlay] cursor_caption (bottom-left, Full view only)
      │  └─ [overlay] FloatingPlay   (bottom-right)
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

`pin-sidebar: true` is **load-bearing** on both OverlaySplitViews:
without it, libadwaita auto-resets `show-sidebar` to `false` as
part of the collapsed↔persistent transition — which defeats the
ApplicationWindow's persistent `show-library` / `show-inspector`
state every time you cross the tablet/mobile breakpoint.

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
  controls. The same rule applies to the `library_toggle`, which
  sits at the **leftmost** slot of the editing pill.
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
get is `window width − persistent sidebars`, which varies with the
tier AND with the user's show-library / show-inspector state;
watching the window mis-estimates it by hundreds of pixels.

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
| `tight` | 0 px | badge only — no tool group (two sidebars open on a small desktop) |
| `compact` | 672 px | the `Adw.ToggleGroup` tool chooser |
| `normal-1` | 720 px | "World" beside the back arrow |
| `normal-2` | 856 px | the brush sentence beside the badge ("Paint · Ground") |
| `roomy` | 1160 px | verbs beside the six tool icons |

Three things about those numbers:

- They are **measured** — `measure()` on the real pills with the
  package stylesheet loaded, which `phone-chrome.probe.spec.ts` reads
  back on every display-backed run — not derived per button. The
  design's §2.4 arithmetic lands low at every rung — 604 vs 672, 664 vs
  720, 784 vs 856, 1124 vs 1160 — because a labelled `Adw.Toggle` is
  wider than the sum of an icon and a word; and the first measured set
  (656 / 704 / 856 / 1136) was 8 px low again below `normal-2`, because
  both pill tables had been read 8 px short. The two rungs with text in
  them are held above the widest reading, because CI's font stack
  renders the sentence and the verbs wider than a workstation's.
- They assume a **roster in the context pill** (150 px, versus 108 px
  solo). The AI assistant joins whenever an agent drives the editor,
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
phone put the only undo on touch two taps deep), and **the armed tool
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
`inspector-collapsed` (≤ 768sp). `SceneEditor.setLayout` moves three
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
bonus, not the contract), undo moves into the context pill as a
visible button — never into "⋯", because it is the only undo on touch
— and the sheet's docked bar carries the tools, the badge and a
recent-tiles strip. While a phone run is on, the bar, the FAB and the
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
| `application-window.blp` ViewStack | `hhomogeneous: false` + `vhomogeneous: false`. Default `true` measures **every page** and uses the max as the stack's size — the scene editor's WebGL canvas leaked into the atlas view's layout | #55 |
| `brush-page.blp` palettes | `wrap: true` + `wrap-cap: 6` instead of `columns: 6`. `Adw.BottomSheet`'s page and bottom bar share one homogeneous `Gtk.Stack` (not ours to configure), so the closed sheet's minimum is the page's: six pinned 54 px columns were 378 px, and the ladder's `Adw.BreakpointBin` — which ignores its child's minimum — allocated the whole editor 18 px past a 360 px window. Caught by `phone-chrome.probe.spec.ts`, not by any log anyone read | this PR |

If you add a new view: keep its minimum-size profile in mind.
A `min-content-width: 1` on the outermost ScrolledWindow is
usually all that's needed. Validate by dragging the window to
360 px and watching the log.

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
destroy. The OverlaySplitView's tablet-breakpoint reflow unmaps the
scene-editor host's children mid-animation; the same happens during
view switches (atlas ↔ scene editor) while the outgoing view fades
out. Anything you tear down in `vfunc_unmap` runs once per transient
hide.

The Excalibur game loop in particular **never recovers** from a
teardown — `excalibur.stop()` calls `cancelAnimationFrame(id)` which
nulls the bridge's pending frame callback. Once the loop is dead it
stays dead until the next `excalibur.start()`. The visible symptom
is "map disappears at the tablet breakpoint and stays gone forever,
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

The left ModeRail wraps the whole sidebar body. The right
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

0. Decide whether it is a new RAIL ROW at all. Three rows is the
   design (World / Library / Game, `mode-rail.blp`), and a place
   that is another lens over data a row already owns is a chip
   page of that row, not a fourth row: Cast, Objects and Sheets
   were three rows of the same master-detail shape over the same
   entity library + sprite sets, and merged into `LibraryView`
   (`library-view.blp`: one host with the rail + the header, a
   `Gtk.Stack` of pages that carry neither). A chip page extends
   `LibraryPage` when it has a split to collapse, `Adw.Bin`
   otherwise, and keeps a header bar only on its DETAIL page (for
   the phone back button).
1. Decide: canvas-bearing or content-only?
2. If canvas-bearing, follow the atlas-view template (outer
   OverlaySplitView wraps inner OverlaySplitView wraps content
   Gtk.Overlay with floating OSD pills). Wrap each pill in its own
   `Gtk.WindowHandle`, never one across the row. If the pills have
   to disclose with width, put a `Adw.BreakpointBin` around the
   view's own content and let it write ONE property — the scene
   editor's `stage` / `chrome-stages.ts` split is the reference
   shape, and the reason is the reverse-iteration gotcha above.
3. If content-only, follow the welcome-view template (one
   OverlaySplitView + an Adw.ToolbarView with a regular
   HeaderBar on the content side).
4. Expose `library-collapsed` + `inspector-collapsed` +
   `show-library` + `show-inspector` GObject properties with
   `false` defaults, and set `pin-sidebar: true` on every
   `Adw.OverlaySplitView` in the view. `ApplicationWindow`'s
   constructor binds its own `show-library` / `show-inspector`
   bidirectionally to each view's same-named properties — so as
   long as the names match, the persistent shared state wires up
   automatically.
5. Add breakpoint setters for the new view in
   `application-window.blp` — mirror the existing per-view
   blocks.
6. Add the view to the `AdwViewStack` in the application window
   template, and — if it is a rail row — to `EditorMode`,
   `MODE_ORDER`, the rail's `.blp` and `VIEW_FOR_MODE` /
   `MODE_FOR_VIEW`; `gjsify run check:mode-routes` fails until all
   six edges agree. The MCP bridge's `set_view` enum
   (`apps/mcp-bridge/src/tools/editing.tools.ts`) is a literal copy
   of `ViewName` that no guard covers: change it in the same commit.
7. Drag the window to 360 px and check the log for
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
  at tablet width** — the bridge's allocation collapsed to its
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
| Phone bar + Brush sheet fit the 360 px floor; recent strip shows whole tiles; pill tables and ladder corrected by GTK measurement (`phone-chrome.probe.spec.ts`) | **landed** |
| Bottom sheet's second page ("Selected" — object properties on phone) | deferred, tracked in `TODO.md` |
| Virtual joystick + action button for a phone Live Run | deferred, tracked in `TODO.md` |

Cross-references:
- [Editor architecture](editor-architecture.md) — view-model-controller
  + ECS session-singleton (the underlying state model the chrome
  observes).
- [Object system](object-system.md) — what the inspectors render.
- [Runtime modes](runtime-modes.md) — how the chrome reacts to
  test-run / full-run toggles.
