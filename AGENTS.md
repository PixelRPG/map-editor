# AGENTS.md

PixelRPG Map Editor — Yarn monorepo. Excalibur.js (web/browser) + GTK/Adwaita (GJS desktop) tile-based RPG map editor.

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for PixelRPG tasks. Read files under `packages/`, `apps/`, `docs/WIP/` before assuming behavior.

## Structure

[Workspaces] |root: ./ |packages/*: reusable libs |apps/*:{maker-gjs,maker-web,storybook-gjs,cli} |games/*:{zelda-like} |docs/ (WIP/ = in-progress notes)

[Package suffixes] |*-core: platform-indep interfaces/types, no browser/Node/GJS deps |*-gjs: GNOME/GTK impl |*-excalibur: Excalibur.js web impl |*-web: browser utils (postMessage, MessageChannel, iframe) |*-webview: WebKit webview bridges. Core defines contracts; platform pkgs implement. Keep platform concerns out of `*-core`.

## General (all code)

[TS] |explicit types on public APIs |no `any` → use `unknown`+type guards |JSDoc public APIs |`is`-style guards for runtime checks |generics for inference |nullability via `?.`/`??`
[Files] |one class/file |types in `types/`, impl elsewhere |barrel exports via index |PascalCase (class files), kebab-case (others), UPPERCASE (constants)
[Errors] |validate inputs |proper error types not bare `Error` |warn on non-critical |explicit edge cases |try/catch around risky ops
[Messaging] |use project's msg-passing system |typed msgs via helpers |enum values > string literals for types |parse with type guards
[X-platform] |`*-core` runtime-indep |feature detection > platform detection

## TypeScript (`**/*.ts`)

[Types] |unknown+guards never any |interface=object shapes, type=unions/intersections/mapped |discriminated unions w/ explicit type prop |string enums for fixed sets (enum > string literal)
[Functional] |pure fns preferred |array methods > loops |no param mutation
[Arch] |SOLID, composition > inheritance, layer separation |immutability first: `readonly`, `as const`, functional updates |fn: <20 exec lines, ≤4 params, verb-first |class: <200 lines, <10 public methods, <10 props, single responsibility |naming: PascalCase class, camelCase var/method, kebab-case file, UPPERCASE const |constructor DI for testability |reactive/event-driven flow, state machines for complex state
[Deps] add via `yarn workspace @pixelrpg/<pkg> add <name>`

## Package-type rules

[`packages/*-core/**/*.ts`] |define interfaces/types/platform-indep utils |no browser/Node/GJS deps |factory fns for complex construction |error hierarchies + factory fns |messaging: WHATWG+WebKit standards, abstract base classes, support both WebKit msg handlers and `window.postMessage`

[`packages/*-gjs/**/*.ts`, `apps/*-gjs/**/*.ts`] |impl `*-core` ifaces for GJS |GObject classes, GNOME naming, composite templates |GObject properties > plain fields |emit signals > accept callbacks |Blueprint for declarative UI |GNOME HIG |messaging: WebKit `UserContentManager` for handlers, `evaluate_javascript` to send, impl `message-channel-core` abstracts

[`packages/*-excalibur/**/*.ts`, `packages/excalibur-*/**/*.ts`] |impl `*-core` ifaces for browser via Excalibur.js ECS |DOM/browser APIs |translate core↔Excalibur types |optimize: min DOM ops, efficient collision, asset caching

[`packages/*-web/**/*.ts`] |standards-based browser comms: postMessage, MessageChannel, iframes, cross-origin
[`packages/*-webview/**/*.ts`] |prefer `window.webkit.messageHandlers`, fallback WHATWG `window.postMessage` |impl `message-channel-core` abstracts w/ auto channel detection

[`packages/data-*/**/*.ts`] |JSON storage, explicit version field, backward-compat |serialization+validation |async resource loading, platform paths |engine-consumable structures, type-safe transforms

## Applications

[`apps/**/*.ts`] |UI ⟂ business logic |reusable composable components (GNOME HIG or web best practices) |no global state |async clean, type-safe state transitions |user-friendly errors w/ recovery |integrate via `packages/*` core ifaces

[`apps/cli/**/*.ts`] |modular commands, reusable cmd classes/fns |proper argparse, sensible defaults, help text per cmd |interactive + non-interactive modes

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

## Adwaita styling (`packages/app-gnome/**/*.css`)

refs: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1-latest/css-variables.html · https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.7/style-classes.html

## Storybook

|stories = GObject GTK widgets in central `StoryRegistry` |instances created only when GTK ready |extend `StoryWidget` (Adw.Bin); abstract base + variant subclasses |register classes (not instances) via `StoryModule` |title format: `'Category/Name'` |per-component `.story.ts`, per-variant `.story.blp` inheriting `$StoryWidget` |static `getMetadata()` → `StoryMeta{title,description,component:.$gtype,tags,controls}` |ctor `{story,args,meta}` |override `initialize()` once, `updateArgs()` on control change |`GObject.type_ensure()` after class def |controls: use `ControlType` enum (not strings); `min`/`max`/`step`; select options `{label,value}` |`.blp` imported directly (Vite plugin)

## Yarn workspaces

|internal deps → workspace refs |external deps → exact versions |script names consistent: `build`, `test`, `lint`, `check`, `format` |add deps: `yarn workspace @pixelrpg/<pkg> add <name>`

## Validation & commits

[Pre-commit] |`yarn build` all pkgs |`yarn check` type check (⚠️ slow, use after larger changes) |`yarn format` Prettier |per-pkg: `yarn workspace @pixelrpg/<pkg> run {check,build}` |fix all errors+warnings before commit

[Commits] |atomic, one logical change |conventional: `<type>[scope]: <description>` (feat|fix|docs|refactor|test|chore) |imperative, subject ≤50 chars, include scope |working state every commit |check `git log --oneline -10` to match project style |commit at milestones for large tasks, not just end

## Documentation

|English, clarity+accuracy+consistency |JSDoc(TS), Google-style(Python), NatSpec(Solidity) |comments = WHY not WHAT; default: no comments unless non-obvious constraint |structure: title → 1-3 sent intro → prereqs → logical sections → examples → troubleshooting → related |test examples, verify links, keep docs in sync |in-progress work → `docs/WIP/` (checklists, arch decisions)

## Systematic workflow (complex multi-step)

1. review `docs/WIP/` for state+remaining tasks
2. analyze: review code, targeted debug, root-cause
3. implement: minimal targeted changes, back-compat, error handling, existing patterns
4. test: scenarios+edge cases, `yarn format && yarn check && yarn build`
5. user confirms BEFORE documenting
6. update `docs/WIP/` + checklists after confirmation
7. atomic conventional commits after confirmation
