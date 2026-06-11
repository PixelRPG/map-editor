# Editor Architecture — GTK View, ECS Model+Controller

> Status: tracked in the [phase table](#where-this-is-implemented) — the single source of truth for what's landed vs planned. The ECS model is also the basis for external control (D-Bus/MCP).

The map editor runs the same Excalibur ECS world that the game runtime uses. Rather than maintaining two parallel state representations — editor state in widget instance fields, runtime state in ECS components — **all session state lives in components on a session-singleton entity in the engine's world**. GTK widgets become thin, subscribing views.

This is the foundation for the runtime-mode flow in [`runtime-modes.md`](runtime-modes.md), and the prerequisite for the future "in-game editor on consoles" port path. It also unblocks Undo/Redo and any future multi-cursor / live-collaborative work without architectural churn.

## Why this exists

Before the migration, the editor's session state was fragmented: `SceneEditorView` owned the active tile/layer in instance fields, `ApplicationWindow` owned project + zoom state, the engine's `MapEditorComponent` held tile-level shadow state, and `TileEditorSystem` pulled editor state through a maker-provided callback. State was duplicated, subscriptions were ad-hoc (GObject signals on individual widgets), and any non-GTK frontend (browser-export editor, future console in-game editor) would have had to reimplement the state plumbing from scratch.

**Goal**: the engine's ECS world is the single source of truth for editor session state. GTK widgets observe, render, and emit "intent" — they don't *own* state.

The engine side of this is shipped (session-singleton, `SessionState` subscription bridge, the editor-state components, the `Command`/undo machinery). Widget adoption is **not** finished: `SceneEditorView` still mirrors `_activeTileId` / `_activeLayerId` next to the per-scene components (see the phase tracker).

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

| Component | Purpose | Former home (pre-migration) |
|---|---|---|
| `ActiveToolComponent` | `{ tool: 'select' \| 'pencil' \| 'eraser' \| 'eyedropper' \| 'object' }` (see note below) | `engine.setEditorState({ tool })` callback |
| `ActiveTileComponent` | `{ spriteSetId, spriteId }` | `SceneEditorView._activeTileId` field (the view still mirrors it — see phase tracker) |
| `ActiveLayerComponent` | `{ layerId }` | `SceneEditorView._activeLayerId` field (same caveat) |
| `ActiveObjectComponent` | the armed object brush (entity `defId`) | new with the object tool |
| `SelectedPlacementsComponent` | selected placement ids | new (built ECS-first) |
| `UndoStackComponent` | `{ commands: Command[], cursor: number }` | new (built ECS-first) |
| `EditorModeComponent` | (marker) | see [`runtime-modes.md`](runtime-modes.md) |
| `RuntimeModeComponent` | (marker) | see [`runtime-modes.md`](runtime-modes.md) |
| `SpawnOverrideComponent` | `{ tileX, tileY }` | see [`runtime-modes.md`](runtime-modes.md) |

The set is intentionally small — anything that doesn't qualify (see below) stays in its natural home.

> **Note on the tool union:** the shipped set is `select | pencil | eraser | eyedropper | object`. `select` is the default — read-only click-to-select that picks the topmost `ObjectPlacement` at the clicked tile (mutating `SelectedPlacementsComponent`) and emits `PLACEMENT_SELECTED` for inspector sync; tile-level / marquee selection is still deferred. `object` stamps the armed object brush (`ActiveObjectComponent`) onto the clicked tile. Bucket-fill, rect, stamp, and event tools remain deferred. Any future tool drops in via the tool MenuButton inside `FloatingTopBar` (see `_buildToolPopover`) by extending the `EditorTool` union in `packages/engine/src/components/active-tool.component.ts`.

### In ECS systems (controller)

Systems query the singleton instead of accepting state via callbacks:

| System | How it consumes session state |
|---|---|
| `TileEditorSystem` | queries `ActiveTool / ActiveTile / ActiveLayer / ActiveObject` components |
| `CameraControlSystem` | direct pointer events — camera state isn't editor state |
| `ObjectSpawnSystem` | walks placements at activate; no session state |
| `PlayerSystem` | gates runtime behaviour on `RuntimeModeComponent`; spawn resolution prefers `SpawnOverrideComponent` per runtime-modes.md |
| `TriggerSystem` | effects fire only in runtime because its source events come from the `RuntimeModeComponent`-gated `PlayerSystem` |

New systems landing as tools / features grow:

| System | When |
|---|---|
| `SelectionSystem` | when "select" tool gains semantics beyond paint |
| `UndoSystem` | once we have command-shaped operations |
| `BucketFillSystem` | when bucket-fill tool lands |
| `MarqueeSelectSystem` | when rect-select tool lands |

> `BucketFillSystem` and `MarqueeSelectSystem` are not currently shipped — they land alongside their respective tools (bucket-fill, rect-select), which are deferred from the shipped `EditorTool` union above.

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

The singleton lives **per scene**. Each `MapScene` constructs its own Excalibur `World`; the singleton is added during scene construction and dies with the scene. Mode markers (`EditorMode`, `RuntimeMode`, `SpawnOverride`), active-tool/tile/layer, selection state — all attach to that per-scene singleton.

Cross-scene continuity is the **maker's** job, not the singleton's. The maker carries an app-level `EditorActive: boolean` bit on `Application` and re-applies `EditorModeComponent` whenever a new `MapScene` activates. Markers that *shouldn't* persist (`RuntimeMode`, `SpawnOverride`) are intentionally not restored on scene-switch — leaving Live Run by switching maps drops you back into pure-editor on the new map. See [`runtime-modes.md`](runtime-modes.md) § "Scene-switch behaviour" for the user-facing rules.

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

### The `Command` shape (Undo + collab)

Every mutating editor operation is a `Command` that captures enough information to apply and revert without referencing runtime entity IDs. The shipped interface lives in `packages/engine/src/commands/types.ts`:

```ts
export interface Command<P = unknown> {
  /** Discriminator + serialisation key — lets the CommandRegistry
   *  re-construct the concrete command from a deserialised Operation. */
  readonly kind: string
  /** User-facing label shown in the Undo/Redo menus / status bar. */
  readonly label: string
  /** Pure, fully serialisable data — enough for both apply and revert,
   *  including any captured "previous value" needed to undo. */
  readonly payload: P
  apply(scene: Scene): void
  revert(scene: Scene): void
}
```

`kind` + the serialisable `payload` are load-bearing for collaboration: they're what lets a remote peer reconstruct and apply the same command (see `AGENTS.md` "Transport-ready primitives" rule 2 — every new mutation must register in `BUILT_IN_COMMANDS`). `UndoStackComponent { commands, cursor }` holds the per-scene stack; `Engine.executeCommand` / `undo` / `redo` drive it.

Stability rule: command payloads reference **stable identifiers** (`layerId`, tile coords, `ObjectPlacement.id`) — **never** Excalibur runtime entity IDs. Entity IDs reset per scene load; placement / layer IDs are stable across save/load. This keeps the undo stack serialisable for "session restore" or collaborative-edit replay.

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

Landed as part of the runtime-modes PR series (see `runtime-modes.md` Phase 1). The session singleton itself + `EditorModeComponent` / `RuntimeModeComponent` / `SpawnOverrideComponent` are the first inhabitants. The maker creates the singleton when constructing `MapScene` and adds `EditorModeComponent` by default.

This was the **minimum** for the architecture to be real — it established the home.

### Phase 2 — `ActiveToolComponent`

Replaced the `engine.setEditorState({ tool })` callback with component mutation. `TileEditorSystem` queries the session singleton instead. The tool MenuButton inside `FloatingTopBar` (popover-driven) mutates the component on selection. Smallest possible migration; it validated the subscription bridge.

### Phase 3 — `ActiveTileComponent` + `ActiveLayerComponent`

The active tile + layer became per-scene components; the `FloatingTopBar` chips, the inspector and `TileEditorSystem` consume them. **Caveat — widget adoption incomplete:** `SceneEditorView` still keeps `_activeTileId` / `_activeLayerId` instance fields alongside the components (the per-scene component resets on scene-switch while the view's value persists, and the view re-syncs by hand). That is the parallel-state shape the migration rule below forbids — either the cross-scene persistence moves to the app-level restore path (per the singleton-lifetime section) or the exception gets designed in deliberately. Tracked in `TODO.md`.

### Phase 4 — `SelectionComponent` + `SelectionSystem`

First **new** feature built directly on the new architecture. The foundation component (`SelectedPlacementsComponent`) has shipped; the marquee-select tool itself — together with multi-tile clipboard and group-move — is deferred to a future phase (`SelectionSystem` lands alongside it). No legacy state to migrate — built fresh in the ECS-first style.

### Phase 5 — `UndoStackComponent` + undo/redo

Mutating operations (paint, erase, place-object, remove-object) emit `Command`s into the per-scene `UndoStackComponent`; `Engine.executeCommand` / `undo` / `redo` apply and reverse them, and the same commands broadcast to collab peers. This is where the architecture pays back the migration investment.

### Future phases (deferred)

- Inspector-side state (active tab, scroll position) — only if useful for layout-restore-after-reload. Probably not worth migrating.
- View-mode state for the welcome / atlas — atlas-card positions are already in `MapData.editorData`, so they're persisted, not session state.

## Why this design survives the console-port path

The future "in-game editor on consoles" target ([`runtime-modes.md`](runtime-modes.md) § Future) requires the editor to run **inside** Excalibur (no GTK). Under the hybrid:

- Components and systems are reusable verbatim. They never touched GTK.
- The View layer gets re-implemented: instead of GTK widgets, Excalibur `ScreenElement` actors render the palette / inspector / floating chrome on top of the game canvas.
- Subscriptions flip from GObject signals to whatever event mechanism the Excalibur-UI framework exposes.
- Same controller, same model, different rendering host. Standard MVC payoff.

That's why we accept the cost of "two layers" now — it pre-pays the cost of "two views" later.

## Where this is implemented

Phase tracker — fill in as PRs land.

| Phase | Scope | Status |
|---|---|---|
| 1 | Mode markers + session-singleton + `SessionState` subscription bridge | **landed** |
| 2 | `ActiveToolComponent` + system migration | **landed** |
| 3 | `ActiveTileComponent` + `ActiveLayerComponent` migration | **landed (engine side)** — `SceneEditorView` still mirrors `_activeTileId` / `_activeLayerId`; widget adoption pending (see Phase 3 caveat) |
| 4 | `SelectedPlacementsComponent` (foundation; marquee `SelectionSystem` is Phase 4b, pending) | **landed** |
| 5 | `UndoStackComponent` + `Command` interface + paint/erase/object commands + Engine `executeCommand` / `undo` / `redo` | **landed** |

**Subscription bridge implementation** — the `SessionState.subscribe` helper shipped with Phase 1 (`packages/engine/src/utils/session-state.ts`). The open work is widget-side: moving the remaining `SceneEditorView` mirrors onto subscriptions (Phase 3 caveat above).

## Related concepts

- [`runtime-modes.md`](runtime-modes.md) — Phase 1's session-singleton is the same entity that hosts the mode markers (`EditorMode`, `RuntimeMode`, `SpawnOverride`). Both docs describe one half of the same machinery; this doc owns the lifecycle + subscription API, runtime-modes owns the mode-marker semantics.
- [`object-system.md`](object-system.md) — the editor UI for the object system (Objects view, object tool, inspector tabs) is built on the subscription bridge here. The data model itself lives in the project file (`GameProjectData.entityLibrary` + `MapData.objectPlacements`), so the in-memory project is not on the session-singleton — only the *editor state about which object is selected / armed* is (`SelectedPlacementsComponent`, `ActiveObjectComponent`).
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — the operation-oriented mutation API + the `Command` interface defined here **is** the editor op vocabulary in the multi-peer sync layer. Phase 5 (Undo) IS the editor op-log. The two docs describe the same mechanism from different angles: this one for single-user UX, the collab doc for multi-peer ordering.
- **External control (D-Bus / MCP)** — `apps/maker-gjs/src/services/control-dbus.service.ts` (`org.pixelrpg.maker.Control`) + the `apps/mcp-bridge` orchestrator are a fourth consumer of this same model: status reads come from the ECS getters (`getDebugStatus`), and mutations (`paint_tile`) go through the very same `Engine.executeCommand` / `Command` path as a pointer click — so an agent-driven edit undoes and syncs to collab peers identically. This is *why* the data-driven ECS model matters beyond the GTK view: GTK widgets, the op-log, multiplayer peers, and the D-Bus/MCP control surface are all just different observers/drivers of one model. A future generic `get_components` projection (serialising the session-singleton) would make the control surface fully data-driven (auto-tracking new components) — tracked in `TODO.md`.

## Cross-references to `AGENTS.md`

- `[Engine patterns — ECS]` (line ~27) is the workspace-wide rule that systems are pure logic, components are pure data, communication via event bus. This doc operationalises it for the editor side: GTK is the third leg of the tripod (View), and the helper API formalises how the leg communicates with the other two.

## Open questions

- **Notification mechanism**: do we add `notifyMutation()` calls explicitly in system mutations (verbose, manual, but explicit), or use a proxy-based reactive layer (less code, more magic)? Default proposal: explicit calls. Magic-free debugging beats magic-fast development.
- **Component identity stability across scene reload**: when the user opens a different project, the active session singleton is destroyed (new scene = new world). Are widget subscriptions auto-resubscribed against the new singleton, or do they need re-bind on `scene-changed`? Default proposal: bridge does it automatically — widgets subscribe by *kind*, bridge tracks the active singleton.
- **Per-widget `_disposables` discipline**: GObject signals already leak by default if you don't `disconnect`. Component subscriptions are no different. Worth a workspace-wide rule that *every* `vfunc_map` accumulates disposables and `vfunc_unmap` releases them — or do we accept the leak risk and rely on widget GC? Default proposal: explicit rule, lint where possible.
