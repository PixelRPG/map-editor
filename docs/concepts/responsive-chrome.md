# Responsive Chrome — Sidebars, Breakpoints, Floating OSDs

> Status: **landed** — describes the chrome architecture as it
> ships in `apps/maker-gjs` today (PRs #48 – #64).
> Last meaningful change: 2026-05-27.

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

`show-library` + `show-inspector` both default to `false` across
all views. Desktop users open the sidebars they want from the
toggle pills (floating-OSD on canvas views; in the headerbar on
welcome). The atlas view auto-opens the inspector on scene-card
selection — a "user-attention" event (PR #53).

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
Adw.OverlaySplitView outer_split
├─ sidebar (start): ModeRail  (or no sidebar in atlas's case)
└─ content: Adw.OverlaySplitView inner_split
   ├─ sidebar (end): RightInspector / SceneInspector
   │     (its own thin flat HeaderBar carries the window-close X)
   └─ content: Gtk.Overlay
      ├─ [overlay] FloatingHistory (top-left)
      ├─ [overlay] ContextChip (top-right)
      ├─ [overlay] FloatingZoom (bottom-center)
      ├─ [overlay] FloatingPlay (bottom-right)
      └─ child: canvas / scene-card area
```

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

Repeated 5× across `FloatingHistory`, `FloatingZoom`, `ContextChip`,
`FloatingToolRail`, the atlas's two inline toggle pills.

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
  controls. Same rule for the left-sidebar toggle if it ever
  joins an OSD pill — leftmost.
- **No `FloatingPlay` WindowHandle wrap**: it's a single big
  button, no empty pixels to drag from. Other pills wrap.
- **Margins**: 12 px from the nearest edge. Top pills + bottom
  pills clear each other; left + right clear the sidebars when
  the sidebars are persistent.

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
4. Expose `library-collapsed` (if applicable) +
   `inspector-collapsed` + `show-library` + `show-inspector`
   GObject properties with `false` defaults.
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

Cross-references:
- [Editor architecture](editor-architecture.md) — view-model-controller
  + ECS session-singleton (the underlying state model the chrome
  observes).
- [Object system](object-system.md) — what the inspectors render.
- [Runtime modes](runtime-modes.md) — how the chrome reacts to
  test-run / full-run toggles.
