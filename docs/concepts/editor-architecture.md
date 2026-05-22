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

### The session-singleton lifetime

The singleton lives **per scene**. Each `MapScene` constructs its own Excalibur `World`; the singleton is added during scene construction and dies with the scene. Mode markers (`EditorMode`, `RuntimeMode`, `GhostSpawn`), active-tool/tile/layer, selection state — all attach to that per-scene singleton.

Cross-scene continuity is the **maker's** job, not the singleton's. The maker carries an app-level `EditorActive: boolean` bit on `Application` and re-applies `EditorModeComponent` whenever a new `MapScene` activates. Markers that *shouldn't* persist (`RuntimeMode`, `GhostSpawn`) are intentionally not restored on scene-switch — leaving Live Run by switching maps drops you back into pure-editor on the new map. See [`runtime-modes.md`](runtime-modes.md) § "Scene-switch behaviour" for the user-facing rules.

This separation — singleton lives per scene, mode-restoration policy lives on the app — keeps each layer responsible for what it can see. Singletons don't try to communicate across scenes; the app coordinates.

### The `SessionState` API

A small helper in `packages/engine/src/utils/session-state.ts` owns the singleton's lifecycle and exposes a typed subscription surface. Pseudo-TypeScript:

```ts
import type { Component, ComponentCtor, Entity, Scene } from 'excalibur'

export type SubscriptionHandle = () => void   // call to disconnect

export class SessionState {
  /** Stable name for the singleton entity. */
  static readonly SINGLETON_NAME = 'session-state'

  /**
   * Get-or-create the singleton on the given scene. Called by the
   * maker during scene construction; idempotent on subsequent calls.
   */
  static ensure(scene: Scene): Entity { /* … */ }

  /** Read the current value of a component, or `null` if not present. */
  static get<C extends Component>(scene: Scene, ctor: ComponentCtor<C>): C | null { /* … */ }

  /** Add or replace a component. Triggers subscribers. */
  static set<C extends Component>(scene: Scene, component: C): void { /* … */ }

  /** Remove a component by type. Triggers subscribers with `null`. */
  static unset<C extends Component>(scene: Scene, ctor: ComponentCtor<C>): void { /* … */ }

  /**
   * Subscribe to add/remove/mutate of a specific component on the
   * singleton. The callback fires:
   * - immediately with the current value (or `null`) at subscribe time
   * - on add — Excalibur's `componentAdded$` observable
   * - on remove — Excalibur's `componentRemoved$` observable
   * - on mutate — when a system calls `SessionState.notifyMutation(scene, component)`
   */
  static subscribe<C extends Component>(
    scene: Scene,
    ctor: ComponentCtor<C>,
    listener: (component: C | null) => void,
  ): SubscriptionHandle { /* … */ }

  /**
   * Notify subscribers that the component's fields changed in place.
   * Systems call this after mutating components. Excalibur has no
   * built-in per-field reactivity; this is an explicit, lint-friendly
   * fence around mutations — see the "Notification" open question.
   */
  static notifyMutation<C extends Component>(scene: Scene, component: C): void { /* … */ }
}

// Usage in a widget:
//
// vfunc_map() {
//   const dispose = SessionState.subscribe(this.scene, ActiveTileComponent, (active) => {
//     this.setTilePaintable(active ? this.resolvePaintable(active) : null)
//   })
//   this._disposables.add(dispose)
// }
//
// vfunc_unmap() { this._disposables.dispose() }
```

`_disposables` is the same lifecycle bag the maker uses for `SignalScope`-style GObject signal cleanup (see `apps/maker-gjs/src/widgets/application-window.ts`). The subscription handles plug into the same scope.

### Anti-parallel-state migration rule

Every migration phase (2 → `ActiveTool`, 3 → `ActiveTile`/`ActiveLayer`, 4 → `Selection`) **must remove the old field in the same PR that introduces the component**. No transitional period where both representations exist.

Reason: if both representations co-exist for a release cycle, every mutating code path has to choose which one to update. Forgotten ones produce silent drift. Cleaner to flip atomically and force every consumer to adopt the new source in the same PR.

This is also recorded in `AGENTS.md` under the migration governance rules so reviewers can call it out automatically.

### `Command` shape for Phase 5 (Undo)

When `UndoSystem` lands, every mutating editor operation emits a `Command` that captures enough information to apply and revert without referencing runtime entity IDs.

```ts
export interface Command {
  /** User-facing label shown in the Undo menu / status bar. */
  readonly label: string

  /** Apply the mutation. Called once on the original action + on redo. */
  apply(world: World): void

  /** Reverse the mutation. Called on undo. */
  revert(world: World): void
}

// Example — every paint stroke captures the previous sprite for revert.
export class PaintTileCommand implements Command {
  constructor(
    private readonly layerId: string,
    private readonly tileX: number,
    private readonly tileY: number,
    private readonly newSpriteId: number,
    private readonly previousSpriteId: number | null,
  ) {}
  get label() { return `Paint tile (${this.tileX}, ${this.tileY})` }
  apply(world: World) { /* set sprite on the map data + redraw */ }
  revert(world: World) { /* restore previousSpriteId, or clear if null */ }
}

// And on UndoStackComponent:
export class UndoStackComponent extends Component {
  public commands: Command[] = []
  public cursor: number = 0   // index of next command to apply on redo
}
```

Stability rule: commands reference **stable identifiers** (`layerId`, tile coords, `ObjectPlacement.id`) — **never** Excalibur runtime entity IDs. Entity IDs reset per scene load; placement / layer IDs are stable across save/load. This keeps the undo stack serialisable for future "session restore" or collaborative-edit replay.

### Performance + error-handling open questions

(Tracked here so the helper API doesn't paint us into a corner.)

- **Query frequency** — every `SessionState.subscribe` call wraps an Excalibur `world.queryManager.createQuery([Ctor])`. Excalibur caches queries by component-type-set; repeated subscribes for the same component reuse the same query. Should be O(1) amortised. Verify with a benchmark once Phase 1 lands.
- **Subscribe-before-singleton** — the maker constructs widgets before the scene is realised. If `SessionState.subscribe` is called when the singleton doesn't exist yet, the subscribe registers and fires `null`; once `SessionState.ensure(scene)` runs, the singleton appears and component-add events propagate. The helper must handle this gracefully — race-free.
- **Memory leaks on scene-switch** — disposing a widget releases its subscriptions, but the singleton + its components themselves are garbage when the scene's world disposes. Verify with the GJS heap profiler after Phase 2 lands.
- **Component-mutation fence** — systems that mutate components in place must call `SessionState.notifyMutation(scene, component)`. Forgetting it = silent stale UI. Mitigation: every component constructor / setter pattern documented, plus an eventual lint rule (`@notifies-mutation` JSDoc that the lint enforces) once we have a real example.

The first three are testable in Phase 2 with the `ActiveToolComponent` migration; the fourth becomes a recurring discipline.

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
| 1 | Mode markers + session-singleton (folds into runtime-modes PR series) | **landed** |
| 2 | `ActiveToolComponent` + system migration | **landed** |
| 3 | `ActiveTileComponent` + `ActiveLayerComponent` migration | **landed** |
| 4 | `SelectedPlacementsComponent` (foundation; marquee `SelectionSystem` is Phase 4b) | **landed** |
| 5 | `UndoStackComponent` + `Command` interface + paint/erase commands + Engine `executeCommand` / `undo` / `redo` | **landed** |

**Subscription bridge implementation** — Phase 1 includes the `SessionState.subscribe` helper. Until that's built, widgets can read the components directly (no notifications on mutation, requires explicit re-render call). The bridge upgrades them to push-based.

## Related concepts

- [`runtime-modes.md`](runtime-modes.md) — Phase 1's session-singleton is the same entity that hosts the mode markers (`EditorMode`, `RuntimeMode`, `GhostSpawn`). Both docs describe one half of the same machinery; this doc owns the lifecycle + subscription API, runtime-modes owns the mode-marker semantics.
- [`object-system.md`](object-system.md) — the editor UI for the object library (Library mode-rail, Object tool, Inspector tab) is built on the subscription bridge here. The data model itself lives in the project file (`GameProjectData.objectLibrary` + `MapData.objectPlacements`), so the in-memory project is not on the session-singleton — only the *editor state about which object is selected* is.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — the operation-oriented mutation API + the `Command` interface defined here **is** the editor op vocabulary in the multi-peer sync layer. Phase 5 (Undo) IS the editor op-log. The two docs describe the same mechanism from different angles: this one for single-user UX, the collab doc for multi-peer ordering.

## Cross-references to `AGENTS.md`

- `[Engine patterns — ECS]` (line ~27) is the workspace-wide rule that systems are pure logic, components are pure data, communication via event bus. This doc operationalises it for the editor side: GTK is the third leg of the tripod (View), and the helper API formalises how the leg communicates with the other two.

## Open questions

- **Notification mechanism**: do we add `notifyMutation()` calls explicitly in system mutations (verbose, manual, but explicit), or use a proxy-based reactive layer (less code, more magic)? Default proposal: explicit calls. Magic-free debugging beats magic-fast development.
- **Component identity stability across scene reload**: when the user opens a different project, the active session singleton is destroyed (new scene = new world). Are widget subscriptions auto-resubscribed against the new singleton, or do they need re-bind on `scene-changed`? Default proposal: bridge does it automatically — widgets subscribe by *kind*, bridge tracks the active singleton.
- **Per-widget `_disposables` discipline**: GObject signals already leak by default if you don't `disconnect`. Component subscriptions are no different. Worth a workspace-wide rule that *every* `vfunc_map` accumulates disposables and `vfunc_unmap` releases them — or do we accept the leak risk and rely on widget GC? Default proposal: explicit rule, lint where possible.
