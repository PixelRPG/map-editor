# AGENTS.md

PixelRPG Map Editor — Yarn monorepo. Single-process GTK4/libadwaita app with Excalibur.js running directly in GJS via gjsify. Tile-based RPG map editor for the GNOME platform; exported games target multiple platforms (browser-runtime seeded under `apps/game-browser`).

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for PixelRPG tasks. Read files under `packages/` and `apps/` before assuming behavior.

## Structure

[Workspaces] |root: ./ |packages/{engine,gjs,story-gjs} |apps/{maker-gjs,storybook-gjs,game-browser} |games/{zelda-like} |docs/

[Packages] |`engine`: Excalibur-based engine + editor logic (Resources, Components, Systems, MapFormat); platform-indep core, runs in GJS or browser |`gjs`: GTK4/libadwaita widgets that host the engine + Gdk-side preview pipeline (Sprite/SpriteSheet/ImageTexture for Gsk-snapshot rendering) |`story-gjs`: Storybook-style framework for GTK widget stories (StoryRegistry, StoryWidget, StoryModule, ControlType)

[Apps] |`maker-gjs`: the map editor (primary) |`storybook-gjs`: widget playground for `packages/gjs` |`game-browser`: browser-runtime template — seed for multi-platform game export

[Architecture] Single-process GTK4 app. No WebView, no RPC. Excalibur runs directly in GJS via gjsify. Engine is hosted as a GTK widget alongside Adwaita UI panels.

## General (all code)

[TS] |explicit types on public APIs |no `any` → use `unknown`+type guards |JSDoc public APIs |`is`-style guards for runtime checks |generics for inference |nullability via `?.`/`??`
[Files] |one class/file |types in `types/`, impl elsewhere |barrel exports via index |PascalCase (class files), kebab-case (others), UPPERCASE (constants)
[Errors] |validate inputs |proper error types not bare `Error` |warn on non-critical |explicit edge cases |try/catch around risky ops
[Events] |prefer `ex.EventEmitter` (Excalibur) for engine-side events |GObject signals for GTK widgets |typed event maps, no raw string literals
[X-platform] |`packages/engine` runtime-indep where possible (GJS + browser); `packages/gjs` GTK-only |feature detection > platform detection

## TypeScript (`**/*.ts`)

[Types] |unknown+guards never any |interface=object shapes, type=unions/intersections/mapped |discriminated unions w/ explicit type prop |string enums for fixed sets (enum > string literal)
[Functional] |pure fns preferred |array methods > loops |no param mutation
[Arch] |SOLID, composition > inheritance, layer separation |immutability first: `readonly`, `as const`, functional updates |fn: <20 exec lines, ≤4 params, verb-first |class: <200 lines, <10 public methods, <10 props, single responsibility |naming: PascalCase class, camelCase var/method, kebab-case file, UPPERCASE const |constructor DI for testability |reactive/event-driven flow, state machines for complex state
[Deps] add via `yarn workspace @pixelrpg/<pkg> add <name>`

## Package-specific rules

[`packages/engine/**/*.ts`] |Excalibur-based ECS: state in `Component`s, behavior in `System`s, orchestration via `Resource`s |MapFormat/MapResource own data shape; Components own runtime state (e.g. [MapEditorComponent](packages/engine/src/components/map-editor.component.ts) for selection/hover/sprite-refs) |runtime-indep where possible (runs in GJS and browser via game-browser) |error hierarchies + factory fns |prefer `ex.EventEmitter` over custom event systems

[`packages/gjs/**/*.ts`, `apps/maker-gjs/**/*.ts`, `apps/storybook-gjs/**/*.ts`] |GObject classes, GNOME naming, composite templates |GObject properties > plain fields |emit signals > accept callbacks |Blueprint for declarative UI |GNOME HIG |GTK preview pipeline (`Gdk.Texture`/Gsk-snapshot for sprite widgets) is distinct from Excalibur's canvas pipeline — both coexist intentionally

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

## Yarn workspaces

|internal deps → workspace refs (`workspace:^` or `workspace:*`) |external deps → exact versions |script names: `build`, `check` (tsc), `start` (apps only) |add deps: `yarn workspace @pixelrpg/<pkg> add <name>`

## Validation & commits

[Pre-commit] |`yarn build` all pkgs |`yarn workspaces foreach -A run check` for full type check (slow) |per-pkg: `yarn workspace @pixelrpg/<pkg> run {check,build}` |fix all errors+warnings before commit

[Commits] |atomic, one logical change |conventional: `<type>[scope]: <description>` (feat|fix|docs|refactor|test|chore) |imperative, subject ≤50 chars, include scope |working state every commit |check `git log --oneline -10` to match project style |commit at milestones for large tasks, not just end

## Documentation

|English, clarity+accuracy+consistency |JSDoc on TS public APIs |comments = WHY not WHAT; default: no comments unless non-obvious constraint |structure: title → 1-3 sent intro → prereqs → logical sections → examples → troubleshooting → related |test examples, verify links, keep docs in sync

## Systematic workflow (complex multi-step)

1. analyze: review code, targeted debug, root-cause
2. implement: minimal targeted changes, error handling, existing patterns
3. test: scenarios+edge cases, `yarn check && yarn build`
4. smoke-test where applicable (run the editor / storybook)
5. user confirms BEFORE committing large changes
6. atomic conventional commits
