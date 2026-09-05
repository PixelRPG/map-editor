# Contributing

This is the practical guide: how to get the workspace running, what the commands are,
and which two mistakes cost contributors the most time here.

The *rules* live in [AGENTS.md](../AGENTS.md). It is long and it is authoritative. Read it
before your first change. This file does not restate it, because a second copy drifts and
the drifted copy is the one people read.

## Prerequisites

- **[`@gjsify/cli`](https://github.com/gjsify/gjsify)**, the whole toolchain: installer,
  builder, formatter, linter, test runner. No Node.js or Yarn required.
- **A GNOME development environment**: GJS, GTK 4, libadwaita, `blueprint-compiler`.
- **Git** 2.30 or newer.

## Setup

```bash
git clone git@github.com:PixelRPG/map-editor.git
cd map-editor

gjsify install                 # lockfile is gjsify-lock.json, there is no yarn.lock
gjsify foreach build -v -t     # topological build
gjsify foreach check -v -t     # type-check every package
```

Then run the editor: `gjsify workspace @pixelrpg/maker-gjs start`.

## The two traps

Both of these produce a **green build and broken behaviour**, which is why they are first.

### A spec that is not registered never runs

Unit tests sit next to the code they cover (`foo.ts`, `foo.spec.ts`). That is not enough.
You must also import the suite in that package's `src/test.mts` and pass it to `run()`.
`test.mts` is hand-maintained. An unregistered spec is silently skipped, and the package
still reports green, so the failure mode is "my tests pass" when nothing ran.

`node scripts/check-spec-registration.mjs` catches it, and CI gates on it.

### A scene mutation that is not a registered `Command` desyncs

Every mutation of scene or map state has to be a `Command` registered in
`BUILT_IN_COMMANDS` (`packages/engine/src/commands/registry.ts`) and listed in
`registry.spec.ts`, executed through `Engine.executeCommand`. Never write the field
directly.

An unregistered command applies fine on your machine and cannot be reconstructed on a
remote peer. It works solo and desyncs the moment a second participant joins, human or AI.
Local testing does not catch this.

Project-level data (the entity library, `playerActorId`, sprite sets) is the documented
exception: it is edited where no scene exists, so it rides the `__project/*` channel
through `ProjectStore` instead. AGENTS.md § Transport-ready primitives has the full
contract and the litmus test.

## Where code goes

```
packages/engine/src/    commands components engine entity format resource
                        runtime scenes services sync systems types utils
packages/gjs/src/       widgets sprite utils
apps/maker-gjs/src/     actions services widgets
```

Note that `components/` in `packages/engine` means **ECS components**, not UI. UI lives in
`packages/gjs/src/widgets`.

The other apps: `game-browser` (browser-runtime template for game export), `mcp-bridge`
(dev-only MCP to D-Bus orchestrator for agent-driving the maker), `signalling-server`
(stateless WebSocket relay for cross-network WebRTC signalling).

## Naming

Files are **kebab-case**. About 520 of them are, and it is the rule.

The roughly 40 PascalCase files are the documented exception from AGENTS.md: one class or
type per file, named after what it exports (`EntityDefinition.ts`, `MapResource.ts`). In
practice they all sit under `types/`, `format/`, `resource/` and `packages/gjs/src/sprite/`.
If you are not adding one of those, use kebab-case.

Suffixes carry meaning and are load-bearing for discovery: `.component.ts`, `.system.ts`,
`.spec.ts`, `.story.ts`.

Inside the code: PascalCase classes, camelCase verb-first methods, `UPPER_SNAKE_CASE`
constants, and interfaces without an `I` prefix.

## Everyday commands

| Task | Command |
|---|---|
| Run the editor | `gjsify workspace @pixelrpg/maker-gjs start` |
| Run the storybook | `gjsify workspace @pixelrpg/gjs storybook` |
| Type-check everything | `gjsify foreach check -v -t` |
| Build everything | `gjsify foreach build -v -t` |
| One package | `cd <pkg> && gjsify run check` |
| Format | `gjsify run format` |
| Lint | `gjsify run lint` |

Biome does both linting and formatting. Prettier and ESLint are not used. Note that the
gjsify CLI's own `lint` and `fix` subcommands wrap oxlint and oxfmt, which this repo does
**not** use, so go through `gjsify run …` as above. GTK CSS is excluded from Biome, which
cannot parse that dialect.

## Tests

Five packages carry suites. Each runs under both GJS and Node:

```bash
gjsify workspace @pixelrpg/engine test             # ECS, commands, sync
gjsify workspace @pixelrpg/gjs test                # GTK-free widget helper logic
gjsify workspace @pixelrpg/maker-gjs test          # collab transport, session services
gjsify workspace @pixelrpg/signalling-server test  # room manager, relay e2e
gjsify workspace @pixelrpg/mcp-bridge test         # instance to D-Bus address routing
```

`gjsify run test` runs all five.

Test the pure logic, not the widget. Geometry, models and services are extracted out of the
widgets precisely so they can be tested without a display, and that is where new coverage
belongs. One caveat when you read the output: `@gjsify/unit` counts **assertions**, not
tests, so the number moving between two runs tells you very little on its own.

For anything that genuinely needs a running GUI, the maker exposes a `Control` D-Bus
interface (`org.pixelrpg.maker.Control`) that can drive and screenshot a live window. See
the MCP orchestrator entry in `TODO.md`.

## Before you push

There is no pre-commit hook. Run `gjsify run format && gjsify run lint` yourself. VS Code
is set up to format on save with `biomejs.biome` (`.vscode/settings.json`).

Fix every error *and* warning. CI does not distinguish.

## What CI runs

`.github/workflows/ci.yml`, on every PR:

1. `gjsify install --immutable`
2. `gjsify system-check`, verifies the system dependencies
3. `biome ci packages apps`, lint and format
4. `gjsify upgrade --check`, dependency declarations consistent
5. `gjsify foreach check -v -t`, type-check
6. `gjsify foreach build -v -t`, build
7. `gjsify foreach check:barrels -v -t`, barrel-drift guard
8. `node scripts/check-spec-registration.mjs`, the spec trap above
9. through 13, the five test suites, as separate steps

If you touch a barrel by hand, step 7 will catch it. Regenerate with
`gjsify foreach check -v -t` rather than editing barrels directly.

## Commits and pull requests

Conventional commits, imperative mood, subject 50 characters or fewer:

```
feat(cast): drag-insert frames at a caret in the anim editor
fix(engine): idle-schedule the focus grab so GTK stops crashing
refactor(sheets): drop duplicate animation editor
docs: add the responsive screenshot baseline
```

Run `git log --oneline -10` first and match what you see. Keep commits atomic: each one
leaves the workspace building and passing.

Never use `--no-verify`, and never bypass signing. If a hook fails, fix the cause.

For the pull request, say what changed and why, link the issue, and include before/after
screenshots for anything visual. If you changed behaviour that `TODO.md` records as
deferred, update that entry in the same PR.

## Where to look next

- [AGENTS.md](../AGENTS.md), the authoritative conventions: ECS patterns, Blueprint, GTK4
  lifecycle, the collaboration contract
- [concepts/](concepts/), living design docs for cross-cutting decisions
- [../TODO.md](../TODO.md), the single source of truth for deferred work and known defects
- Per-package `README.md` under `packages/` and `apps/`
