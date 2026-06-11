# AGENTS.md

PixelRPG Map Editor — gjsify-native monorepo (no Yarn, no Node-only build tooling). Single-process GTK4/libadwaita app with Excalibur.js running directly in GJS via gjsify. Tile-based RPG map editor for the GNOME platform; exported games target multiple platforms (browser-runtime seeded under `apps/game-browser`).

Toolchain: `gjsify install` (replaces yarn), `gjsify build` (replaces esbuild/vite), `gjsify barrels` (replaces barrelsby), `gjsify format` / `gjsify lint` / `gjsify fix` (wraps Biome), `gjsify foreach` / `gjsify workspace` (replaces `yarn workspaces foreach`), `gjsify flatpak` for `apps/maker-gjs` packaging. Lockfile: `gjsify-lock.json` (no `yarn.lock`).

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for PixelRPG tasks. Read files under `packages/` and `apps/` before assuming behavior.

## Structure

[Workspaces] |root: ./ |packages/{engine,gjs,story-gjs} |apps/{maker-gjs,storybook-gjs,game-browser,mcp-bridge,signalling-server} |games/{zelda-like,blank-starter,minimalist-starter} |docs/

[Packages] |`engine`: Excalibur-based engine + editor logic (Resources, Components, Systems, MapFormat); platform-indep core, runs in GJS or browser |`gjs`: GTK4/libadwaita widgets that host the engine + Gdk-side preview pipeline (Sprite/SpriteSheet/ImageTexture for Gsk-snapshot rendering) |`story-gjs`: Storybook-style framework for GTK widget stories (StoryRegistry, StoryWidget, StoryModule, ControlType)

[Apps] |`maker-gjs`: the map editor (primary) |`storybook-gjs`: widget playground for `packages/gjs` |`game-browser`: browser-runtime template — seed for multi-platform game export |`mcp-bridge`: dev-only MCP↔D-Bus orchestrator for agent-driving the maker (`org.pixelrpg.maker.Control`) |`signalling-server`: stateless WebSocket relay for cross-network WebRTC signalling

[Games / starter templates] every `games/<id>/` is a workspace package (`@pixelrpg/games-<id>`) containing a real `game-project.json` + `maps/` + `spritesets/`. The welcome view's "Start from Template" cards list them and render a live map preview via `@pixelrpg/gjs`'s `MapPreview`. New Project = open the `blank-starter` template; Open Project = real `Gtk.FileDialog` selecting any `game-project.json` (including a template).

[Architecture] Single-process GTK4 app. No WebView, no RPC. **gjsify merges three worlds in-process** — GNOME / GTK widgets, Node.js APIs, and Web/DOM APIs. Excalibur runs directly in GJS through this; reach for it freely for rendering pipelines (preview rendering, runtime, etc.) instead of pre-rendering to PNG or shelling out.

[File format] In `@pixelrpg/engine`'s `format/` modules. **Pre-release; breaking changes explicitly allowed.** No users yet, no migration shims. When a schema change lands, update every consumer in the workspace in the same PR — every `games/*` template, the maker, the game-browser seed, the engine tests.

[Deferred work] `TODO.md` at the workspace root is the **workspace-wide** index of everything intentionally not built yet. Keep it pruned — terse one-line entries grouped by surface, no "done" section (use `git log` for that). Append new entries whenever you punt something during a session; remove the entry in the same commit that resolves it. PRs whose work creates or resolves a TODO MUST update `TODO.md` in the same commit.

[Concept-scoped TODOs] When a `docs/concepts/<doc>.md` carries its own tracker (a phase / rollout table, an "Open questions" section, a "Where this is implemented" citation list, planned-vs-landed markers), **those trackers are TODOs too** and follow the same rule: update them in the same commit as the implementing code — flip `planned → landed`, strike resolved open questions, refresh implementation citations to point at real files. A workspace-wide TODO.md entry and a concept-doc tracker entry can co-exist (the workspace index links the concept doc); when the tracker entry resolves, the corresponding TODO.md entry resolves too. Drift in either direction = blocked PR.

[Conceptual decisions] `docs/concepts/` holds living docs for cross-cutting design decisions — data models, ECS patterns, runtime contracts, file-format reasoning. Anything two-or-more packages share a mental model on lives here, not in per-package READMEs. **Keep these docs current**: update the concept file in the same commit that changes the underlying code or schema; delete sections that describe superseded approaches (use `git log` for history). Each doc carries a `Status:` header (planning / active / superseded) plus the date of the last meaningful change. Index + maintenance rules in `docs/concepts/README.md`. Drift between a concept doc and the implementation = blocked PR.

[Engine patterns — ECS] Excalibur Components/Systems. Components are pure data (serialisable, no methods that mutate state). Systems are pure logic (no persistent state beyond per-tick scratch buffers; state lives in components or scene resources). Cross-system communication goes through the engine event bus (`engine.events.emit / .on`), not direct method calls between systems. Class-hierarchy entities (e.g. `Player extends Actor`) only with a written justification in the PR description — default is composition. See `docs/concepts/object-system.md` for the canonical event names + spawn flow.

[Anti-parallel-state migration] When a PR migrates a piece of state to a new home (e.g. a widget instance field like an active-tile id → a component on the session-singleton, or any move from instance-field to ECS-component), the **same PR removes the old field entirely**. No transitional period where both representations exist. Reason: every mutating code path otherwise has to choose which one to update; forgotten branches produce silent drift that's expensive to debug. Atomic flip forces every consumer to adopt the new source in the same review. Applies symmetrically when collapsing duplicate state in either direction.

[Transport-ready primitives] Five cross-cutting constraints keep every PR compatible with multi-peer sync. Collab pair-editing (WebRTC) **and** the in-process AI collaborator are **now live** (see `docs/concepts/collaboration-and-multiplayer.md` + `docs/concepts/ai-collaborator.md`) — so these are load-bearing, not future-proofing: skip one and the feature works solo in your test but silently desyncs the moment a second participant (human or AI) is present. (1) **Stable IDs only as keys** — `ObjectPlacement.id` (carried at runtime by `PlacementIdComponent.id`), `LayerData.id`, `EntityDefinition.id`, `MapData.id`, `GameProjectData.playerActorId`. **Never** use Excalibur runtime `Entity.id` as a persistent / wire / save-state key. (2) **Operation-oriented mutation API** — every editor mutation issues a named operation (`MovePlacement(id, x, y)`, not `placement.tileX = …`). The operation IS the undo command IS the wire-message. One vocabulary, three uses. **A new mutation MUST be a `Command` registered in `BUILT_IN_COMMANDS` (`commands/registry.ts`) and listed in `registry.spec.ts`** — an unregistered command applies locally but can't be reconstructed on a remote peer, so it works solo and desyncs in collab (the trap local testing won't catch). It also must flow through `Engine.executeCommand` (→ op-log → `COMMAND_EXECUTED` → peers), never a direct field write. **Exception — project-level data** (the cast + entity library: `entityLibrary`, `playerActorId`, plus sprite-sets) is edited in the Cast view where there is NO live scene/engine, so it can't be a `Command` (those need a `Scene`). It rides the `__project/*` **project-op** channel instead (`sync/project-operations.ts` → `CollabSession.sendProjectOp` / `onProjectOpReceived` → `CastController.applyRemoteProjectOp`): coarse, idempotent upserts applied straight to each peer's `GameProjectData` over the always-present op channel, no undo stack. A new project-level mutation must broadcast via `sendProjectOp` and apply via `applyRemoteProjectOp`. (3) **`InputSourceComponent` from day one** when the player-movement system is built — read input from the component, not directly from keyboard/gamepad. Makes split-screen + network multiplayer a plug-in instead of a refactor. (4) **Transport-friendly schema** — stable keys in array-shaped collections, no circular references, JSON-serialisable everywhere, no proxy-magic or non-deterministic ordering. Applies to every schema touch in `@pixelrpg/engine`'s `types/data/`. (5) **Ephemeral presence → awareness, not the op-log** — "what is this participant doing *right now*" (cursor, selection, hover, presence/colour) goes through the `AwarenessManager` layer (`sendCursor` / `sendSelection` / `announce` → `RemoteCursorRenderer`), NOT a Command: it's unreliable/throttled, per-peer, and must NOT land on the undo stack. Any new live-presence affordance must (a) broadcast via awareness from `CollabSession.attachEngine` (mirror the cursor/selection bridges) and (b) render per-peer in the peer's colour — each participant already has a distinct colour via `colourForPeer`, and the AI assistant is just another awareness peer. **Litmus for any new feature:** does its state change ride a registered `Command` if it's scene/map state (so peers + undo get it) — or a `__project/*` project-op if it's project-level cast/sprite-set data — and does any new live affordance ride awareness (so peers *see* it)? If you can't answer both, it's not collab-ready.

## General (all code)

[TS] |explicit types on public APIs |no `any` → use `unknown`+type guards (enforced by Biome `noExplicitAny: error`) |JSDoc public APIs |`is`-style guards for runtime checks |generics for inference |nullability via `?.`/`??`
[Files] |one class/file |types in `types/`, impl elsewhere |barrel exports via index |PascalCase (class files), kebab-case (others), UPPERCASE (constants)
[Errors] |validate inputs |proper error types not bare `Error` |warn on non-critical |explicit edge cases |try/catch around risky ops
[Events] |prefer `ex.EventEmitter` (Excalibur) for engine-side events |GObject signals for GTK widgets |typed event maps, no raw string literals
[X-platform] |`packages/engine` runtime-indep where possible (GJS + browser); `packages/gjs` GTK-only |feature detection > platform detection

## TypeScript (`**/*.ts`)

[Types] |unknown+guards never any |interface=object shapes, type=unions/intersections/mapped |discriminated unions w/ explicit type prop |string enums for fixed sets (enum > string literal)
[Functional] |pure fns preferred |array methods > loops |no param mutation
[Arch] |SOLID, composition > inheritance, layer separation |immutability first: `readonly`, `as const`, functional updates |fn: <20 exec lines, ≤4 params, verb-first |class: <200 lines, <10 public methods, <10 props, single responsibility |naming: PascalCase class, camelCase var/method, kebab-case file, UPPERCASE const |constructor DI for testability |reactive/event-driven flow, state machines for complex state |stateless utilities → module functions, not static-only classes
[Deps] add via `cd <pkg-dir> && gjsify install <name>` (single-package install, writes to that workspace's `package.json`)

## Package-specific rules

[`packages/engine/**/*.ts`] |Excalibur-based ECS: state in `Component`s, behavior in `System`s, orchestration via `Resource`s |MapFormat/MapResource own data shape; Components own runtime state (e.g. [MapEditorComponent](packages/engine/src/components/map-editor.component.ts) for the per-tilemap tile shadow state; selection lives in `SelectedPlacementsComponent`) |runtime-indep where possible (runs in GJS and browser via game-browser) |services/ exports module functions, not static-only classes |sprite-set consumers in services accept `SpriteIndex` (structural, works for both Excalibur `SpriteSetResource` and GTK `GdkSpriteSetResource`) |error hierarchies + factory fns |prefer `ex.EventEmitter` over custom event systems |unit-tested via `@gjsify/unit` (`gjsify test`): colocate `foo.spec.ts` next to `foo.ts`, then **import it and pass it to `run()` in that package's `src/test.mts`** — `test.mts` is hand-maintained, an unregistered spec silently never runs (CI stays green testing nothing; this trap already bit `project-operations.spec.ts` — see `TODO.md` "Spec-registration guard")

[`packages/gjs/**/*.ts`, `apps/maker-gjs/**/*.ts`, `apps/storybook-gjs/**/*.ts`] |GObject classes, GNOME naming, composite templates |GObject properties > plain fields |emit signals > accept callbacks |Blueprint for declarative UI |GNOME HIG |GTK preview pipeline (`Gdk.Texture`/Gsk-snapshot for sprite widgets) is distinct from Excalibur's canvas pipeline — both coexist intentionally |signal lifecycle: use `SignalScope` from `@pixelrpg/gjs` (connect in `vfunc_map`, `disconnectAll()` in `vfunc_unmap`) — don't track handler IDs by hand

[`packages/story-gjs/**/*.ts`] |StoryRegistry/StoryModule/StoryWidget framework for GTK widget stories |consumed by both `packages/gjs` (defines stories) and `apps/storybook-gjs` (renders them) |controls via `ControlType` enum

[`apps/game-browser/**/*.ts`] |minimal browser host for `@pixelrpg/engine` |seed for game-export runtime — keep small, no maker-specific code

## Applications

[`apps/**/*.ts`] |UI ⟂ business logic |reusable composable components (GNOME HIG) |no global state |async clean, type-safe state transitions |user-friendly errors w/ recovery |integrate via `@pixelrpg/engine` ECS

## GTK4 + GObject (GJS)

[Design] declarative UI (Blueprint) + reactive state (GObject props/signals)
[Render] GSK snapshot API, GPU-first
[Lifecycle] Map/Unmap/Unroot for hooks, minimal Dispose

[DO] |`vfunc_snapshot()` + `Gdk.Texture`/`Gdk.Paintable` + clip+translate for sprites |`append_scaled_texture()` (GTK≥4.10) w/ `Gsk.ScalingFilter` |state=Properties, events=Signals, bind via Blueprint |connect in `vfunc_map()`, disconnect in `vfunc_unmap()` (+ `vfunc_unroot()` for globals) |always call `super.vfunc_*()`

[DON'T] |no Cairo/`Gtk.DrawingArea` for perf (fallback only) |don't mutate `Gdk.Texture` (immutable) |no `destroy()`/`::destroy` |no JS in `dispose`/`finalize` |don't collide w/ core vfunc names (`get_flags`, `dispose`, `constructed`) — rename helpers

[vfunc roles] |`map`: start timers, connect signals, subscribe |`unmap`: stop timers, disconnect everything from map |`unroot`: drop global/external refs (bus, singletons) |`dispose`: only break external refs, no UI/signals/async |`finalize`: rarely needed

[Fix "JS callback during GC … get_flags()" warn] |grep `get_flags(` and rename |connects→map, disconnects→unmap |strip JS from dispose/finalize |clear timers+global subs in unmap/unroot

## Blueprint (`**/*.blp`)

Goal: declarative UI in `.blp`, logic in TS. Bind don't hardcode.
|namespaces: `using Gtk 4.0; using Adw 1;` |template names prefixed `$`, extend `Adw.Window`/`Adw.Bin`/etc |bind: `bind template.prop` 1-way, `bind template.prop bidirectional` editable |expressions > ad-hoc callbacks |signals wired in .blp (`clicked => $_on_action();`), impl in TS (`@Gtk.Template.Callback()` when needed), `_onXxx()` naming |prefer `GAction`/`action-name` over manual `clicked` |`MenuButton.menu-model` for menus |a11y: meaningful labels/`accessible-name`, keyboard nav preserved, tooltips only for non-obvious |layout: shallow, consistent spacing/margins, intentional `hexpand/halign/valign` |`InternalChildren` only for elements touched in code |no deep nesting, no biz logic in .blp, don't connect signals in code when .blp can

## Adwaita styling (`packages/gjs/src/**/*.css`, `apps/*/src/**/*.css`)

CSS lives next to the widget that consumes it; index files compose package-level styles. CSS Nesting (`&:hover`) is supported — gjsify's CSS plugin lowers nesting for the GTK CSS parser at build time.

refs: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1-latest/css-variables.html · https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.7/style-classes.html

## Storybook

|stories = GObject GTK widgets in central `StoryRegistry` |instances created only when GTK ready |extend `StoryWidget` (Adw.Bin); abstract base + variant subclasses |register classes (not instances) via `StoryModule` |title format: `'Category/Name'` |per-component `.story.ts`, per-variant `.story.blp` inheriting `$StoryWidget` |static `getMetadata()` → `StoryMeta{title,description,component:.$gtype,tags,controls}` |ctor `{story,args,meta}` |override `initialize()` once, `updateArgs()` on control change |`GObject.type_ensure()` after class def |controls: use `ControlType` enum (not strings); `min`/`max`/`step`; select options `{label,value}` |`.blp` imported directly (Vite plugin)

## Workspaces (gjsify-native)

|internal deps → workspace refs (`workspace:^` or `workspace:*`); `gjsify install` symlinks each child's `node_modules/@pixelrpg/*` → sibling workspace source |external deps → exact versions, hoisted into root `node_modules/` |script names per package: `build`, `check` (tsc), `build:barrels` / `check:barrels` (gjsify barrels), `start` (apps only), `test` (engine, maker-gjs, signalling-server — each `gjsify test` + a hand-maintained `src/test.mts`) |add deps: `cd <pkg-dir> && gjsify install <name>` (writes the spec into that workspace's package.json) |root: `gjsify install` rehoists + relinks; `gjsify install --immutable` for CI

## Build / format / lint / test (root-level scripts)

|`gjsify foreach build -v -t` — topological build (root `build`) |`gjsify foreach check -v -t` — type-check + barrel regen across all packages |`gjsify foreach check:barrels -v -t` — drift guard (CI: any stale barrel exits non-zero) |`gjsify foreach test -v -p --include @pixelrpg/engine --include @pixelrpg/maker-gjs --include @pixelrpg/signalling-server` — all test suites (`@gjsify/unit`; this is the root `test`; CI runs the same three suites as separate steps — use one `--include` or `gjsify workspace <pkg> test` for a single suite) |`gjsify workspace @pixelrpg/maker-gjs start` — run the editor (root `start`) |`gjsify fix` / `gjsify lint` / `gjsify format --check` — Biome wrappers (read project's `biome.json`)

## Flatpak (maker-gjs)

App-ID `org.pixelrpg.maker`. Manifest + MetaInfo + .desktop generated from `apps/maker-gjs/package.json#gjsify.flatpak` via `gjsify flatpak init`. Commands at root (delegate to `gjsify workspace @pixelrpg/maker-gjs <script>`): `flatpak:init` (regenerate assets) | `flatpak:check` (lint via appstreamcli + flatpak-builder-lint) | `flatpak:build` (`flatpak-builder` + install + bundle .flatpak).

## Validation & commits

[Pre-commit] |no automated hook — devs run `gjsify fix && gjsify lint` manually before committing (CI does NOT lint/format-check — tracked in TODO.md "Biome cleanup + CI lint gate"; it runs type-check, build, the barrel-drift guard and the engine + maker-gjs + signalling-server test suites, with `@gjsify/cli` pinned to the gjsify-lock.json version — see `.github/workflows/ci.yml`) |`gjsify foreach build -v -t` builds all packages |`gjsify foreach check -v -t` full type check (slow) |`gjsify workspace @pixelrpg/engine test` for engine unit tests |per-pkg: `cd <pkg> && gjsify run {check,build}` |fix all errors+warnings before commit

[Commits] |atomic, one logical change |conventional: `<type>[scope]: <description>` (feat|fix|docs|refactor|test|chore) |imperative, subject ≤50 chars, include scope |working state every commit |check `git log --oneline -10` to match project style |commit at milestones for large tasks, not just end

## Documentation

|English, clarity+accuracy+consistency |JSDoc on TS public APIs |comments = WHY not WHAT; default: no comments unless non-obvious constraint |structure: title → 1-3 sent intro → prereqs → logical sections → examples → troubleshooting → related |test examples, verify links, keep docs in sync

## Systematic workflow (complex multi-step)

1. analyze: review code, targeted debug, root-cause
2. implement: minimal targeted changes, error handling, existing patterns
3. test: scenarios+edge cases, `gjsify run check && gjsify run build` (or root `gjsify foreach check -v -t`)
4. smoke-test where applicable (run the editor / storybook)
5. user confirms BEFORE committing large changes
6. atomic conventional commits
