# Editor Architecture — GTK View, ECS Model+Controller

> Status: **planning** — design captured, migration phased.
> Last meaningful change: 2026-05-22.

The map editor runs the same Excalibur ECS world that the game runtime uses. Rather than maintaining two parallel state representations — editor state in widget instance fields, runtime state in ECS components — **all session state lives in components on a session-singleton entity in the engine's world**. GTK widgets become thin, subscribing views.

This is the foundation for the runtime-mode flow in [`runtime-modes.md`](runtime-modes.md), and the prerequisite for the future "in-game editor on consoles" port path. It also unblocks Undo/Redo and any future multi-cursor / live-collaborative work without architectural churn.

## Why this exists

Today the editor's session state is fragmented:
- `SceneEditorView` holds `_activeTileId`, `_activeLayerId`, `_layers`, `_tiles`, `_tilesetName`, `_tilesetFirstGid`, …
- `ApplicationWindow` holds `_loadedProject`, `_scenesById`, `_engineCtl`, `_lastReportedZoom`, …
- The engine's `MapEditorComponent` holds tile-level shadow state
- `TileEditorSystem` pulls editor state through a `getEditorState()` callback the maker provides

Result: state is duplicated, subscriptions are ad-hoc (GObject signals on individual widgets), and any non-GTK frontend (browser-export editor, future console in-game editor) would have to reimplement the state plumbing from scratch.

**Goal**: the engine's ECS world is the single source of truth for editor session state. GTK widgets observe, render, and emit "intent" — they don't *own* state.

## The three-layer split

```
┌─────────────────────────────────────────────────────────┐
│  VIEW       Adwaita widgets, BLP templates, GObject      │
│              signals, Floating-OSDs, Inspector tabs      │
└────────────────┬───────────────────────────────┬────────┘
                 │ subscribe / re-render         │ emit "intent"
                 ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│  MODEL      ECS components on a session-singleton entity │
│              in the engine's Excalibur world             │
└────────────────▲───────────────────────────────┬────────┘
                 │ mutate                        │ query
                 │                               ▼
┌─────────────────────────────────────────────────────────┐
│  CONTROLLER ECS systems (TileEditorSystem,               │
│              SelectionSystem, UndoSystem, …)             │
│              + the kind-specific runtime systems         │
└─────────────────────────────────────────────────────────┘
```

- **View**: stays GTK. Adwaita gives us free theming, accessibility, focus management, keyboard handling, screen-reader support, animations. Replacing that is not worth it for the foreseeable future.
- **Model**: ECS components on a singleton entity named `session-state` in the active scene's world. Add/remove components to toggle state.
- **Controller**: ECS systems read input (via the engine's event bus + Excalibur's pointer/keyboard) + the model components, then mutate the model. They never touch GTK directly.

## What lives where

### In ECS components (the new home)

Editor-state components, all on the session-singleton entity:

| Component | Purpose | Today's home (pre-migration) |
|---|---|---|
| `ActiveToolComponent` | `{ tool: 'brush' \| 'eraser' \| 'bucket' \| 'rect' \| 'select' \| 'stamp' \| 'event' }` | `engine.setEditorState({ tool })` callback |
| `ActiveTileComponent` | `{ spriteSetId, spriteId }` | `SceneEditorView._activeTileId` field |
| `ActiveLayerComponent` | `{ layerId }` | `SceneEditorView._activeLayerId` field |
| `SelectionComponent` | `{ entityIds: number[] }` | doesn't exist yet — would land here |
| `UndoStackComponent` | `{ commands: Command[], cursor: number }` | doesn't exist yet — would land here |
| `EditorModeComponent` | (marker) | see [`runtime-modes.md`](runtime-modes.md) |
| `RuntimeModeComponent` | (marker) | see [`runtime-modes.md`](runtime-modes.md) |
| `GhostSpawnComponent` | `{ tileX, tileY }` | see [`runtime-modes.md`](runtime-modes.md) |

The set is intentionally small — anything that doesn't qualify (see below) stays in its natural home.

### In ECS systems (controller)

Existing systems migrate to query the singleton instead of accepting state via callbacks:

| System | What it does today | What changes |
|---|---|---|
| `TileEditorSystem` | reads `getEditorState()` callback per tick | queries `ActiveTool / ActiveTile / ActiveLayer` components |
| `CameraControlSystem` | direct pointer events | unchanged — camera state isn't editor state |
| `ObjectSpawnSystem` | walks placements at activate | unchanged |
| `PlayerSpawnSystem` | resolves player spawn | gains the `GhostSpawnComponent` short-circuit per runtime-modes.md |
| `TriggerSystem` | walks placements per event | gates on `RuntimeModeComponent` presence |

New systems landing as tools / features grow:

| System | When |
|---|---|
| `SelectionSystem` | when "select" tool gains semantics beyond paint |
| `UndoSystem` | once we have command-shaped operations |
| `BucketFillSystem` | when bucket-fill tool lands |
| `MarqueeSelectSystem` | when rect-select tool lands |

### In GTK (the view) — what stays

| Concern | Stays in GTK |
|---|---|
| Widget hierarchy, layout, breakpoints | `Adw.ViewStack`, `Adw.OverlaySplitView`, `Adw.Breakpoint` |
| Theming, accent color, light/dark | `Adw.StyleManager` |
| Focus management, keyboard nav | GTK's built-in focus chain |
| Accessibility (ATK / AT-SPI) | GTK widgets' a11y tree |
| Animations / transitions | GTK's animation framework + `Adw.LeafletTransition` |
| BLP templates, composite widgets | `Gtk.Template` |
| File-picker dialogs | `Gtk.FileDialog` |
| Toasts, popovers | `Adw.Toast`, `Gtk.Popover` |

We do **not** try to model the widget tree as entities. GTK does that well; ECS doesn't add value at the render layer.

### The subscription bridge

Widgets observe component mutations through a small bridge living on the engine controller (or a sibling helper):

```ts
// Pseudo-API
class SessionState {
  subscribe<C extends Component>(
    componentCtor: ComponentCtor<C>,
    listener: (component: C | null) => void,
  ): Disconnect
}

// In ContextChip.vfunc_map:
const disconnect = sessionState.subscribe(ActiveTileComponent, (active) => {
  this.setTilePaintable(active ? this.resolvePaintable(active) : null)
})
this._disposables.push(disconnect)
```

Implementation notes:
- The bridge listens to the entity's component-added / component-removed signals (Excalibur exposes these) + a per-component "mutated" notification (we'd add `notifyMutation()` calls in the setters when systems update the data).
- `vfunc_unmap` / `vfunc_dispose` releases the subscriptions to avoid leaks.
- A central `SessionState` helper is the only place that knows about the singleton entity — every widget asks the controller, not the world directly.

## What's NOT on the table

Decisions captured here so future PRs don't re-relitigate them:

- **Widgets-as-entities is rejected.** We don't model `ApplicationWindow → ViewStack → SceneEditorView → RightInspector` as a parent-child entity hierarchy. GTK does that with `Gtk.Widget` and we'd gain nothing.
- **No CSS-in-ECS.** Styling stays in `.css` files consumed by `Gtk.CssProvider`. ECS doesn't touch presentation.
- **Per-widget local UI state stays local.** A `Gtk.Picture`'s hover state, a `Gtk.Popover`'s position, a `Gtk.SearchEntry`'s current text — these are widget-internal. ECS only owns *session* state (state that survives a widget rebuild).
- **One session singleton, not many.** Multiple session entities would invite "which one's authoritative?" bugs. The singleton lives on the active `MapScene` and dies with it.

## Migration strategy

Five phases, ordered by leverage. Each is its own PR. The current code keeps working at every step — no big bang.

### Phase 1 — Foundation: mode-marker components

Lands as part of the runtime-modes PR series (see `runtime-modes.md` Phase 1). The session singleton itself + `EditorModeComponent` / `RuntimeModeComponent` / `GhostSpawnComponent` are the first inhabitants. The maker creates the singleton when constructing `MapScene` and adds `EditorModeComponent` by default.

This is the **minimum** for the architecture to be real. Nothing migrates yet; we just establish the home.

### Phase 2 — `ActiveToolComponent`

Replaces the `engine.setEditorState({ tool })` callback with component mutation. `TileEditorSystem` queries the session singleton instead. The maker's tool-rail click handlers mutate the component. Smallest possible migration to validate the subscription bridge.

### Phase 3 — `ActiveTileComponent` + `ActiveLayerComponent`

`SceneEditorView._activeTileId` and `_activeLayerId` move to components. The context-chip + inspector subscribe. `TileEditorSystem` consumes them.

### Phase 4 — `SelectionComponent` + `SelectionSystem`

First **new** feature built directly on the new architecture. Marquee-select tool, multi-tile clipboard, group-move. No legacy state to migrate — built fresh in the ECS-first style.

### Phase 5 — `UndoStackComponent` + `UndoSystem`

The killer feature. Once all mutating operations (paint, erase, place-object, move, layer-edit) emit commands into the stack, `UndoSystem` replays / reverses them. Currently there's no undo at all; this is where the architecture pays back the migration investment.

### Future phases (deferred)

- Inspector-side state (active tab, scroll position) — only if useful for layout-restore-after-reload. Probably not worth migrating.
- View-mode state for the welcome / atlas — atlas-card positions are already in `MapData.editorData`, so they're persisted, not session state.

## Why this design survives the console-port path

The future "in-game editor on consoles" target ([`runtime-modes.md`](runtime-modes.md) § Future) requires the editor to run **inside** Excalibur (no GTK). Under the hybrid:

- Components and systems are reusable verbatim. They never touched GTK.
- The View layer gets re-implemented: instead of GTK widgets, Excalibur `ScreenElement` actors render the palette / inspector / tool rail on top of the game canvas.
- Subscriptions flip from GObject signals to whatever event mechanism the Excalibur-UI framework exposes.
- Same controller, same model, different rendering host. Standard MVC payoff.

That's why we accept the cost of "two layers" now — it pre-pays the cost of "two views" later.

## Where this is implemented

Phase tracker — fill in as PRs land.

| Phase | Scope | Status |
|---|---|---|
| 1 | Mode markers + session-singleton (folds into runtime-modes PR series) | planned |
| 2 | `ActiveToolComponent` + system migration | planned |
| 3 | `ActiveTileComponent` + `ActiveLayerComponent` migration | planned |
| 4 | `SelectionComponent` + `SelectionSystem` | planned |
| 5 | `UndoStackComponent` + `UndoSystem` | planned |

**Subscription bridge implementation** — Phase 1 includes the `SessionState.subscribe` helper. Until that's built, widgets can read the components directly (no notifications on mutation, requires explicit re-render call). The bridge upgrades them to push-based.

## Open questions

- **Notification mechanism**: do we add `notifyMutation()` calls explicitly in system mutations (verbose, manual, but explicit), or use a proxy-based reactive layer (less code, more magic)? Default proposal: explicit calls. Magic-free debugging beats magic-fast development.
- **Component identity stability across scene reload**: when the user opens a different project, the active session singleton is destroyed (new scene = new world). Are widget subscriptions auto-resubscribed against the new singleton, or do they need re-bind on `scene-changed`? Default proposal: bridge does it automatically — widgets subscribe by *kind*, bridge tracks the active singleton.
- **Per-widget `_disposables` discipline**: GObject signals already leak by default if you don't `disconnect`. Component subscriptions are no different. Worth a workspace-wide rule that *every* `vfunc_map` accumulates disposables and `vfunc_unmap` releases them — or do we accept the leak risk and rely on widget GC? Default proposal: explicit rule, lint where possible.
