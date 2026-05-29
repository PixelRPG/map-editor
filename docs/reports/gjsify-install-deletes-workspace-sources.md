# Brief: `gjsify install` deletes workspace source files

## TL;DR

In a monorepo with `gjsify install`'s native backend, running `gjsify install` deletes ~219 source files from the workspace packages themselves (not just from `node_modules`). Affected dirs include the entire `src/` tree of every internal workspace, plus assets in workspace data dirs. `git status` shows them as ` D` after the install completes successfully (exit 0). `git restore .` recovers everything; the next install repeats the deletion. The lockfile is correctly updated; workspace symlinks get wired correctly; only the working-tree wipe is wrong.

## Reproduce

```bash
git clone git@github.com:PixelRPG/map-editor.git
cd map-editor
git checkout chore/bump-gjsify-0.4.29   # or any branch that already has gjsify-lock.json
gjsify install                          # exit 0
git status --short | grep '^ D' | wc -l # → 219
```

The repo is a monorepo with workspaces under `apps/*`, `packages/*`, `games/*` (10 total). gjsify version: `@gjsify/cli@0.4.29`. OS: Fedora 44, GJS 1.88; same behavior reported on the CI Fedora 43 runner. Backend: `native` (default).

## What gets deleted

`git status --short | grep '^ D'` lists 219 paths. Spot-check categories:

- `games/zelda-like/game-project.json`, `games/zelda-like/maps/*.{json,tmx}`, `games/zelda-like/spritesets/*.{json,png,tsx}` — every non-`package.json` file in this workspace.
- `packages/engine/src/**/*.ts`, `packages/engine/env.d.ts`, `packages/engine/README.md` — every non-`package.json` file in this workspace.
- `packages/gjs/src/**/*.{ts,css,blp}`, `packages/gjs/README.md`, `packages/gjs/env.d.ts` — same pattern.
- `packages/story-gjs/src/**` — same pattern.

Each affected workspace's own `package.json` survives. Files under `apps/*/src/**` do **NOT** get deleted. The workspaces whose contents survive intact (`apps/maker-gjs`, `apps/storybook-gjs`, `apps/game-browser`) are exactly the ones marked `"private": true` in their `package.json`; the workspaces whose contents are wiped are the **publishable** ones (`@pixelrpg/engine`, `@pixelrpg/gjs`, `@pixelrpg/story-gjs`) plus the assets workspace `@pixelrpg/zelda-like`.

That last observation is the smoking gun: the installer is almost certainly applying a publish-style file filter (think `npm pack`'s `files` field / `.npmignore`) to publishable workspaces and pruning everything that isn't on the list. The `files` field in `packages/engine/package.json` reads `["dist"]` — i.e. "for npm publish, only `dist/` ships." If that filter gets applied to the actual workspace dir, every `src/` file becomes "extra" and gets removed.

## What works

- `git restore .` brings everything back.
- After `restore`, `gjsify foreach build -v -t` succeeds.
- `gjsify foreach build` runs `tsc`/`gjsify build` on the workspaces and produces correct output.
- The lockfile (`gjsify-lock.json`) is correctly updated by the install; no rerun needed.
- The 8 workspace symlinks under `node_modules/@pixelrpg/*` are correctly wired by the install.

So only the **wipe step** is wrong. Everything else the installer does is fine.

## Where to start looking in gjsify

Suspect files in `/home/jumplink/Projekte/gjsify/gjsify/`:

- `packages/infra/cli/src/commands/install.ts` — the `install` command entry point. Look for a `projectInstallNative` flow.
- `packages/infra/cli/src/utils/install-backend-native.ts` — the native backend the user hit (CI also runs `--immutable` against it). Tail of the stack trace from the CI failure:
  ```
  installPackagesNative (.../install-backend-native.js:47:19)
  installPackages       (.../install-backend.js:25:23)
  workspaceInstall      (.../commands/install.js:292:9)
  projectInstallNative  (.../commands/install.js:158:9)
  ```
- Anywhere the installer reads `package.json#files` or applies a `.npmignore` filter to a directory other than a pack tarball. That's almost certainly the bug.
- The order around the "wired 8 workspace symlink(s)" log line — the wipe likely happens just before or just after.

## Acceptance criteria

1. **Repro is gone.** Fresh clone → `gjsify install` → `git status --short` is empty (or shows only legit updates like `gjsify-lock.json`).
2. **Publish behaviour unchanged.** `gjsify pack @pixelrpg/engine` (or whatever the publish path is) still produces a tarball containing only `dist/` + `package.json` + `README.md` per the workspace's `files` field. The file-filter was correct **for publish**; it just needs to stay out of the workspace dir's working tree.
3. **Native backend stays the default**, no escape-hatch `--backend npm` workaround.
4. **Regression test** under `tests/e2e/`: a new e2e that sets up a fixture monorepo with one publishable workspace containing `src/index.ts` + `package.json` (`"files": ["dist"]`), runs `gjsify install`, and asserts `src/index.ts` still exists afterwards.
5. **STATUS.md** updated per gjsify's "every code/test change updates STATUS.md" rule.

## Not in scope

- The CI-side ` D` recovery loop in user repos: that's the consumer's pipeline concern. We add a defensive `git restore .` after `gjsify install` on our side until this lands.
- The libsoup warnings (`runtime check failed: (host->conns == NULL)`) that print before the install summary. Possibly related (a Soup session cleanup race in the npm-registry fetch path), possibly unrelated. Out of scope for this brief.
- The pre-existing "first install of new `@gjsify/*` package needs Trusted Publisher bootstrap" workflow. Different code path.

## Repo paths

- gjsify monorepo (the code to fix): `/home/jumplink/Projekte/gjsify/gjsify/` (branch `main`, latest release `v0.4.29`).
- map-editor repro (the consumer): `/home/jumplink/Projekte/gjsify/pixel-rpg/map-editor/` (any branch with `gjsify-lock.json`; `chore/bump-gjsify-0.4.29` is the freshest).

## Branch / PR conventions (gjsify repo)

Per `AGENTS.md` in the gjsify repo:
- Branch off `main`. Conventional commits (`fix(install): …` or `fix(cli): …`).
- Update `STATUS.md` in the same commit.
- Open the PR; CI runs `Fedora 43 (GJS 1.86 / SM 140)` + `Fedora 44 (GJS 1.88 / SM 140)` + `Lint commit messages` + `Socket Security` (×2). Each takes ~40 min.
- Squash-merge.
- Once merged the user typically cuts a patch release (`v0.4.30`) so consumers can bump.
