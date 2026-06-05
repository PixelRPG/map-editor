# Responsive Chrome — Sidebars, Breakpoints, Floating OSDs

> Status: **landed** — describes the chrome architecture as it
> ships in `apps/maker-gjs` today (PRs #48 – #64).
> Last meaningful change: 2026-06-04.

The editor has three top-level views (welcome, atlas, scene-editor)
and one window-level chrome system that has to render acceptably
from a 360 px-wide smartphone form-factor up to a 4K desktop
monitor. This doc is the high-level map of how that's stitched
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
| Mobile      | `max-width: 768sp`                     | `library-collapsed: true` + `inspector-collapsed: true` on every view (atlas, scene-editor, welcome*) |
| Tablet      | `min-width: 768sp and max-width: 1023sp` | `library-collapsed: true` on atlas + scene-editor only                                                |
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
(headerbar buttons on atlas / cast / tiles / welcome; merged top
OSD on the scene editor).

---

## Right inspector — auto-open policy

The right inspector is the **context surface**: it shows
information + settings about whatever the user just selected.
When a selection lands and inspector content becomes available,
the inspector **auto-opens** if it was closed.

| View          | Triggering selection                                          | Inspector content                          |
|---------------|---------------------------------------------------------------|--------------------------------------------|
| Atlas         | Click a scene card                                            | Scene preview, metadata, Open Scene CTA    |
| Cast          | Click a character row in the gallery                          | Name, isPlayer, speed, animation duration  |
| Tiles         | Click a tile in the palette                                   | Solid switch, surface combo                |
| Scene editor  | Click a placement with the `'select'` tool (canvas-side hit)  | Objects-tab row highlights, props          |

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

**Mobile / tablet behaviour falls out for free.** The window-level
`inspector-collapsed` breakpoint setter (≤ 1024sp) flips the
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
window breakpoint at ≤ 1024sp) the right inspector can grow
nearly as wide as the window itself — its `max-sidebar-width`
shrinks once content lands on it. On a 360 px-wide phone
that leaves zero space for an "outside-tap-to-dismiss" target,
so the only reliable way to close the drawer has to be **inside**
the drawer.

Each of the four right-inspector widgets (`RightInspector`,
`SceneInspector`, `CastInspector`, `TileInspector`) carries a
`collapsed: boolean` GObject property + a circular-flat close
button in the `[start]` slot of its flat headerbar. The button
binds `visible` to `collapsed` so:

- **Desktop** (`collapsed: false`) — button hidden. The panel
  is pinned, the toggle in the floating top OSD (scene editor)
  or the central headerbar (atlas / cast / tiles) is the
  expected close affordance.
- **Tablet / mobile** (`collapsed: true`) — button visible. Click
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

Layout shape:

```
Adw.OverlaySplitView outer_split   (pin-sidebar: true)
├─ sidebar (start): ModeRail  (or no sidebar in atlas's case)
└─ content: Adw.OverlaySplitView inner_split   (pin-sidebar: true)
   ├─ sidebar (end): RightInspector / SceneInspector
   │     (its own thin flat HeaderBar carries the window-close X)
   └─ content: Gtk.Overlay
      ├─ [overlay] FloatingTopBar (top, spans full width)
      │     — absorbed the former FloatingHistory + ContextChip +
      │       FloatingToolRail roles: undo/redo/grid, active-tool
      │       MenuButton, active-tile + active-layer context chip,
      │       sidebar toggles
      ├─ [overlay] FloatingZoom (bottom-LEFT)
      ├─ [overlay] FloatingPlay (bottom-right)
      └─ child: canvas / scene-card area
```

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

Repeated across `FloatingTopBar`, `FloatingZoom`, `FloatingPlay`,
and the atlas's two inline toggle pills. `FloatingTopBar` is a
single pill that contains the history controls + active-tool
MenuButton + context chip + sidebar toggles internally — not five
separate pills sitting next to each other.

```blp
Adw.Bin {
  halign: start | end | center;
  valign: start | end | center;
  margin-…: 12;

  // WindowHandle gives empty space inside the pill (between buttons,
  // outer padding) a window-drag affordance. Buttons inside bypass
  // automatically — Gtk widget event semantics.
  Gtk.WindowHandle {
    child: Gtk.Box {
      orientation: horizontal | vertical;
      spacing: 2;
      styles ["toolbar", "osd"]

      // …buttons, separators, action-bound widgets…
    };
  }
}
```

Conventions:

- **Sidebar toggle position**: the right-sidebar toggle (`inspector_toggle`)
  always sits at the **rightmost** slot of whatever pill hosts it
  (PR #52). Position on screen visually maps to the side it
  controls. The same rule applies to the `library_toggle`, which
  now sits at the **leftmost** slot of `FloatingTopBar`.
- **No `FloatingPlay` WindowHandle wrap**: it's a single big
  button, no empty pixels to drag from. Other pills wrap.
- **Margins**: 12 px from the nearest edge. Top pills + bottom
  pills clear each other; left + right clear the sidebars when
  the sidebars are persistent.

---

## FloatingTopBar's internal breakpoint cascade

Unlike the rest of the chrome — which reacts to
`ApplicationWindow`-level breakpoints — `FloatingTopBar` carries
its **own** `Adw.BreakpointBin` watching its **own allocated
width**, not the window width. This is necessary because the
amount of horizontal space the top bar actually gets is
`window width − persistent sidebars` (variable across
breakpoints and across the user's show-library / show-inspector
state). Watching the window would mis-estimate the room available
by hundreds of pixels.

The cascade:

| Threshold        | Behaviour                                                            |
|------------------|----------------------------------------------------------------------|
| ≥ 880sp          | **split**: history + tools + chip + toggles laid out as one row      |
| < 880sp          | **merged**: collapsed into a more compact layout                     |
| < 740sp          | progressive disclosure step 1 (drops the lowest-priority cluster)    |
| < 620sp          | progressive disclosure step 2                                        |
| < 540sp          | progressive disclosure step 3                                        |
| < 460sp          | progressive disclosure step 4 (most compact form)                    |

The **critical gotcha**: `Adw.BreakpointBin` activates **one**
breakpoint at a time. It iterates its breakpoints in **reverse**,
breaks on the first match, and applies only that breakpoint's
setters (see `adw-breakpoint-bin.c:421-428` in the libadwaita
source — the loop reads `for (i = priv->breakpoints->len; i-- > 0;)`
and `break`s once one matches). That means any setter you want
applied at, say, 540sp must **also** be present on the 460sp
breakpoint — they don't stack. The setters for each range have to
be written **cumulatively**, listing every property that should
be in effect at that width and below.

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

The fixes that turned out to matter:

| Location                          | Fix                                                                                                                                                                                  | PR  |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| `atlas-canvas.blp` ScrolledWindow | `min-content-width: 1` + `min-content-height: 1` detaches the inner `Gtk.Fixed` surface's `set_size_request(W, H)` from propagating upward                                           | #54 |
| `scene-inspector.blp`             | Drop the hard `width-request: 300`                                                                                                                                                   | #54 |
| `engine.blp`                      | Wrap `canvasContainer` in a `Gtk.ScrolledWindow` with `min-content-{width,height}: 1` + `hscrollbar-policy: external` (size-detach only, no scrollbars). Same trick, different layer | #57 |
| `welcome-view.blp` recents column | Inner `Gtk.ScrolledWindow` gets `min-content-width: 1`. Dropped the `width-request: 320` floor on the recents column                                                                 | #60 |
| `application-window.blp` ViewStack | `hhomogeneous: false` + `vhomogeneous: false`. Default `true` measures **every page** and uses the max as the stack's size — the scene editor's WebGL canvas leaked into the atlas view's layout | #55 |

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

1. Decide: canvas-bearing or content-only?
2. If canvas-bearing, follow the atlas-view template (outer
   OverlaySplitView wraps inner OverlaySplitView wraps content
   Gtk.Overlay with floating OSD pills).
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
   template.
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

Cross-references:
- [Editor architecture](editor-architecture.md) — view-model-controller
  + ECS session-singleton (the underlying state model the chrome
  observes).
- [Object system](object-system.md) — what the inspectors render.
- [Runtime modes](runtime-modes.md) — how the chrome reacts to
  test-run / full-run toggles.
