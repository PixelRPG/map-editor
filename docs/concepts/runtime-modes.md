# Runtime Modes — Editor, Full Run, Live Run

> Status: **planning** — design captured, no implementation yet.
> Last meaningful change: 2026-05-22.

The maker is **both** an editor and a runtime host. Three orthogonal modes — *editor active*, *runtime active*, *ghost spawn override* — compose to produce the user-visible "play modes". Inspired by Super Mario Maker's "edit ⇄ play seamlessly at the cursor's current tile" workflow.

The composition rule is the load-bearing idea: modes are **ECS marker components on a session-singleton entity**. Systems gate themselves on those markers. No mode dispatcher, no state machine — just composition.

The session-singleton is the same entity described in [`editor-architecture.md`](editor-architecture.md) — that doc owns the broader Model/View/Controller split. This one only covers the **mode markers** that live on the singleton.

## Why this exists

In a traditional editor, "test the game" means closing the editor, launching the game build, navigating back to the map you were just on, and walking to the position you were editing. Mario Maker proved that closing the loop — *play right where you are, right now* — collapses the iteration time from minutes to seconds and is the single biggest UX win in level-design tools.

We want the same: the user is editing a tile in `kokiri-forest` at `(15, 9)`, hits Play, and the engine *immediately* renders the player there in runtime mode. Walk a few tiles, find the bug, hit Stop, fix the tile, hit Play again. No window switch, no project reload.

For shipping, the same engine has to run in a **separate window** without the editor chrome — that's "Full Run". And for testing the browser-export build of the same game, the runtime needs to be hostable inside a `WebKit.WebView`.

## The three modes

| Mode marker | What it enables when present |
|---|---|
| `EditorModeComponent` | Tool systems active — tile painter, object placer, selection, undo/redo. Inspector edits are committed to the in-memory project. |
| `RuntimeModeComponent` | Game systems active — player movement, input bindings, trigger system *actually fires effects*, animations advance, audio plays. |
| `GhostSpawnComponent` | The player is spawned at the component's `tileX/tileY` instead of the map's `kind: 'spawn-point'` placement. In-memory only — does **not** modify the project data. |

Combinations are first-class. Each user-facing button picks a marker set:

| Button / action | Markers active | Result |
|---|---|---|
| Default (open editor) | `EditorMode` | Pure editor — tools work, nothing moves, triggers are visualised but don't execute |
| **Play here** ("Live Run") | `EditorMode` + `RuntimeMode` + `GhostSpawn{tileX, tileY = camera focus}` | The current scene starts playing from where the user is editing. The user can keep painting tiles while the player walks around them. Mario-Maker move. |
| **Test run** (no edit) | `RuntimeMode` + `GhostSpawn` | Same in-editor window, but the floating top-bar's tool affordances are hidden and the inspector goes read-only — clean run-through. Esc / Stop → drops the runtime marker, back to editor. |
| **Launch full game** | (new window) `RuntimeMode` only | Game launches in a dedicated window with the project's real `startup.initialMapId` + `kind: 'spawn-point'` placement. No editor chrome. This is what shipping looks like. |

**Why marker components instead of an enum:** "Live Run" isn't a separate mode from "Editor" — it's `Editor && Runtime`. Modelling each as a separate boolean marker lets the systems independently observe their own concern without anyone owning a giant `Mode` enum that needs a switch statement everywhere.

## ECS layout

### The session-singleton entity

On scene activate, an `ex.Entity` named `'session-mode'` is added to the world. The mode markers (`EditorModeComponent`, `RuntimeModeComponent`, `GhostSpawnComponent`) live on this singleton. Adding/removing a component flips a mode.

```ts
// Default state inside the maker
const session = new ex.Entity({ name: 'session-mode' })
session.addComponent(new EditorModeComponent())
scene.add(session)

// User hits "Play here":
const session = scene.world.queryManager.createQuery([EditorModeComponent]).entities[0]
session.addComponent(new RuntimeModeComponent())
session.addComponent(new GhostSpawnComponent(camera.tileX, camera.tileY))

// User hits Stop:
session.removeComponent(RuntimeModeComponent)
session.removeComponent(GhostSpawnComponent)
```

### Systems gate themselves on session state

Every editor / runtime system starts with a one-line check against the session singleton:

```ts
class TileEditorSystem extends System {
  update(elapsed: number) {
    if (!this.hasEditorMode(world)) return
    // … paint logic …
  }
}

class PlayerMovementSystem extends System {
  update(elapsed: number) {
    if (!this.hasRuntimeMode(world)) return
    // … movement logic …
  }
}
```

A tiny helper (`SessionMode.hasEditor(world)` / `hasRuntime(world)`) keeps the boilerplate to one line. Same pattern any system uses to react to mode presence.

### Ghost spawn replaces the real spawn

`PlayerSpawnSystem` already exists (PR 4). It picks up a new rule: if `GhostSpawnComponent` is present on the session singleton, prefer it over the map's `kind: 'spawn-point'` placement. Otherwise fall back to the existing behaviour.

```ts
// PlayerSpawnSystem.initialize
const ghost = sessionEntity.get(GhostSpawnComponent)
const spawn = ghost ?? findSpawnPointEntity(world)
this.events.emit('player-spawned', spawn)
```

The map data stays untouched — ghost spawn is purely runtime state.

## Mode transitions

Transitions are user-driven and atomic. The maker UI owns them; the engine exposes pure component-add / -remove operations.

| User action | Component mutation | Side effect |
|---|---|---|
| Open project | Add `EditorMode` to session | Maker shows editor chrome |
| Click "Play here" | Add `RuntimeMode` + `GhostSpawn{camera-focused tile}` | Player entity spawns at ghost, player-movement / trigger systems start firing effects |
| Press Esc / click Stop | Remove `RuntimeMode` + `GhostSpawn` | Player entity despawns, world reverts to editor-only state |
| Click "Test run" | Remove `EditorMode`, add `RuntimeMode` + `GhostSpawn` | Editor chrome hides, no painting; same window |
| Click "Launch game" | (new window opens, fresh session with `RuntimeMode` only) | Separate process / `Gtk.ApplicationWindow` with the engine fullscreen |

Crucially: re-entering edit after live-run **doesn't undo gameplay state changes**. If the user opened a chest in live mode (`ItemPickupSystem` removed the entity), the chest stays gone for that session. To get a "fresh" runtime, the user removes + re-adds the `RuntimeMode` marker, which triggers a scene reload from the map data — that's the equivalent of Mario Maker's "reset" button.

### Scene-switch behaviour

The session-singleton lives **per scene** — when the user switches maps, the active scene's world (and its singleton) is destroyed, the new scene constructs a fresh one. Mode markers don't auto-carry. The maker reconstructs them on every scene-activate from an app-level source of truth:

- `EditorMode` is restored automatically (the user is still "in the editor" — that's a window-level state, not scene-level).
- `RuntimeMode` is **not** restored. Switching scenes from inside Live Run drops you back into pure-editor on the new scene. If the user wants to play again, they hit "Play here" again on the new scene. Matches Mario-Maker behaviour where leaving a course always returns to edit mode.
- `GhostSpawn` is not restored. The ghost was anchored to the previous scene's camera focus; on the new scene it makes no sense.

The app-level source of truth lives on `Application` (the GJS `Adw.Application` singleton) — `Application._editorActive: boolean` is the bit that determines whether `EditorMode` is added when constructing each `MapScene`. The maker mutates that bit when the user enters/exits the editor entirely (e.g. closes the project).

This decision is part of the broader editor architecture in [`editor-architecture.md`](editor-architecture.md) § "Migration strategy" — Phase 1's singleton lifetime + app-level state-restoration helper is the same machinery used here.

## Windowing (Full Run only)

Live Run + Test Run reuse the **same** `Gtk.GLArea` widget the maker already hosts — no extra window, that's the whole point of the seamless flow.

Full Run is different. The user wants a clean "this is what shipping looks like" experience. Two transports, picked by the user:

### A — GJS-native window (default)

A new `Gtk.ApplicationWindow` (or `Adw.ApplicationWindow`) containing a fresh `WebGLBridge` widget. The same `@pixelrpg/engine` boots inside that window with `RuntimeMode` only. Editor chrome is absent. The window stays alive independently — the user can keep editing the project in the main window while the game window runs.

Same engine code path as the editor's in-process engine; differs only in:
- No editor systems added
- New window owns its own scene lifecycle
- Closing the window despawns the engine cleanly

### B — WebKit WebView

For testing the **browser-export build** of the project: spawn a `WebKit.WebView` window pointing at the bundle URL. Same project files served via a tiny local HTTP server (or `data:` URL for static cases). The engine inside the WebView runs in pure-browser mode — no GJS, no @gjsify shim path — exactly matching what the user's eventual deployed game does.

Useful for:
- Catching browser-only bugs (Web Audio quirks, CSS issues, no-FS fallback paths)
- Showing the WebGL-bridge baseline isn't doing anything magic the browser can't
- A second pair of eyes on perf — WebKit's profiler is well-understood

Same project, two render hosts. The user picks via a dropdown on the "Launch game" button.

## Future: in-game editor (console port path)

Long-term: instead of compositing the editor *around* the engine in GTK, compose it **inside** the engine — Excalibur draws the map + a custom editor HUD (palette, inspector) as Excalibur graphics. The whole thing runs in any environment Excalibur runs in: browser, WebView, embedded webview on consoles (PlayStation, Switch dev-kits do this).

This is the inversion of the current architecture (GTK on the outside, Excalibur on the inside). The mode-marker design described above survives the inversion intact — the editor systems just talk to Excalibur graphics instead of Gtk widgets. That's the load-bearing payoff for going component-marker now.

Out of scope for current implementation. Mentioned so the maker UI doesn't make decisions that lock the engine to GTK chrome.

## Where this is implemented

Phase tracker — fill in as PRs land. Anything cited here must exist in the tree at the cited path.

**Phase 1 — Mode markers (planned)**:
- `packages/engine/src/components/editor-mode.component.ts`
- `packages/engine/src/components/runtime-mode.component.ts`
- `packages/engine/src/components/ghost-spawn.component.ts`
- Session-singleton helper in `packages/engine/src/utils/session-mode.ts`
- Existing systems gain a one-line guard against `hasEditorMode` / `hasRuntimeMode`

**Phase 2 — Maker controls (planned)**:
- Headerbar "Play here" button → toggle session markers in the active `MapScene`
- Stop / reset action
- Hide editor chrome when `EditorMode` is absent

**Phase 3 — `PlayerSpawnSystem` ghost-spawn handling (planned)**:
- Update existing system to prefer `GhostSpawnComponent` when present

**Phase 4 — Full-Run windowing (planned)**:
- "Launch game" action opens a new `Gtk.ApplicationWindow` with a fresh engine instance (`RuntimeMode` only, no editor systems)
- Dropdown variant: launch as WebKit `WebView` pointing at the project's browser bundle

**Phase 5 — Future-proofing for in-game editor (deferred)**:
- Tracked here as a design constraint, not a build target. Confirm the mode-marker API survives the GTK-outside → Excalibur-outside inversion before committing to it.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — defines the session-singleton entity that hosts the mode markers, the `SessionState` subscription API the maker UI uses to react to mode changes, and the per-scene singleton lifetime that this doc references. Read first if you want to understand *how* mode changes propagate to the GTK widgets.
- [`object-system.md`](object-system.md) — `TriggerSystem` and the kind-specific systems (teleport, item-pickup, walk-on-tile) gate themselves on `RuntimeModeComponent`. In pure editor mode they render placements but don't execute effects. In Live Run / Test Run / Full Run they fire normally.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) — Full Run with multiplayer is where the game op-log machinery activates. Player 1 hosts and the engine's per-tick state changes (player movement, trigger effects, item pickups) become broadcast ops. Live Run and Test Run share a single peer's simulation — they're not multiplayer-aware. Mode markers (`EditorMode` / `RuntimeMode` / `GhostSpawn`) are local-only and never replicate.

## Open questions

- **Save-state during Live Run** — if the user paints a tile while the runtime is active and then hits Stop, does the painted tile persist? Default proposal: yes. Editor edits always commit to the in-memory project; the runtime is just a *renderer* of that project. Ghost spawn is the only state that doesn't commit.
- **Reset semantics** — should "Stop" auto-reset the entity state (re-spawn picked-up items, re-position the player), or hold it for "Re-Play" to refresh? Default proposal: Stop holds, dedicated "Reset" button re-spawns. Mario Maker leans the same way.
- **Pause** — if the user clicks back into the inspector during Live Run, does time pause? Default proposal: yes; clicking outside the engine widget pauses, clicking back resumes. Avoid the "I'm typing in the inspector while my player runs into spikes" failure mode.
- **WebView host integration** — what's the cheapest way to serve a project to a `WebKit.WebView` for Full Run? `data:` URL is bounded by URL-length limits; an in-process Soup server is the cleanest but adds a network hop. Decide when Phase 4 lands.
