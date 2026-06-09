# Concept Documentation

Living documents for **conceptual decisions** about how the PixelRPG editor and engine are built. Each file in this directory describes one cross-cutting concept (data model, system pattern, runtime behaviour) — the *why* behind a chunk of the codebase.

## What belongs here

- **Architectural patterns** — "we use ECS, here's how" / "objects are prototype-instance"
- **Data-model decisions** — the file-format shapes that span multiple packages and the reasoning behind them
- **Runtime conventions** — message bus contracts, lifecycle ordering, scene-load semantics
- **Cross-cutting concerns** — anything where two or more packages need to share a mental model

## What does NOT belong here

- **API reference** — that lives in the source as JSDoc.
- **How-to guides for tools** — that's `CONTRIBUTING.md` or per-package `AGENTS.md`.
- **Per-PR design notes** — those go in the PR description.
- **TODO items / open work** — those live in `TODO.md`.
- **Bug reports against external libraries** — those go in `../../../<library>/docs/reports/` (e.g. the gjsify reports).

## Maintenance

These docs are **living**. Update them in the same commit that changes the underlying code or schema — drift between a concept doc and the implementation makes the doc actively harmful (a reader who trusts a stale doc writes wrong code).

Rules:

- **Update in the same commit** as the change. Don't leave the doc trailing.
- **Delete decisively** when a concept is superseded. Don't keep "old approach" sections — that's what `git log` is for.
- **One status source per doc: the phase tracker.** Every doc carries exactly one phase/implementation tracker section (a phase table, or a phase list with per-item status). That section is the **single source of truth** for what's landed vs planned. The header contains **only a link** to it — never its own status word, never a phase summary, never a "last changed" date (`git log -- <file>` is the date source). Rationale: the 2026-06-09 audit found every drift was a header or index row lying while the tracker in the same file was accurate — duplicated status is where drift lives.
- **Cross-link**: every concept doc cites the package(s) and file path(s) where the concept is implemented. When you refactor, update the citations.
- **One concept per file.** If two concepts are getting tangled, split them.
- **In-doc trackers are TODOs.** The phase tracker, "Open questions", and "Where this is implemented" citations are first-class tasks — update them in the same commit that lands the implementation. Flip `planned → landed`, strike resolved open questions, refresh citations to point at real files. The same rule that governs the workspace-level `TODO.md` (no drift, update in the same commit, no "done" archive) applies inside concept docs.

## Index

Ordered by dependency — read top-to-bottom for the cleanest mental sequence. Each doc builds on the ones above it. The index deliberately carries **no status column** — each doc's phase tracker is the single source of truth for what's landed (see Maintenance rules).

| File | What it covers |
|---|---|
| [`editor-architecture.md`](editor-architecture.md) | **Foundation** — Three-layer split (GTK View, ECS Components as Model, ECS Systems as Controller), the session-singleton entity, the `SessionState` subscription API. Everything else lives on top. |
| [`responsive-chrome.md`](responsive-chrome.md) | **View-layer chrome** — Breakpoints (mobile / tablet / desktop), sidebar layout patterns, floating-OSD vs regular-headerbar treatment, size-propagation hazards, engine-resize handling. The "how does the UI fit on every screen" map. |
| [`runtime-modes.md`](runtime-modes.md) | **Mode markers** — `EditorMode` / `RuntimeMode` / `SpawnOverride` components on the session-singleton. Composes the Editor / Full Run / Live Run / Test Run user-visible modes, Mario-Maker-inspired. |
| [`object-system.md`](object-system.md) | **What's in the world** — Definition/Placement model for tiles, objects, NPCs, items, teleports, spawn points. Maps placements to ECS entities via `ObjectSpawnSystem`. Its composition layer is being superseded by the entity-composition model below. |
| [`entity-and-appearance-model.md`](entity-and-appearance-model.md) | **The target content model** — explicit `components[]` on entity definitions (replaces `ObjectKind`-switch + properties union), component registry with schema-generated inspectors, templates as the RPG-Maker-style authoring surface, declarative states, **Appearance** (sheet + animations) as a shared asset layer. Folds the Cast "Characters"/"Sprite sheets" split in; where the built-in code editor attaches. |
| [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) | **Multi-peer sync** — Op-Log with Host-Sequencer (Player 1) for both collaborative editing and networked multiplayer. Single mechanism, two op vocabularies. Solo edits work locally; collab requires a host. |
| [`ai-collaborator.md`](ai-collaborator.md) | **In-process AI as live peer** — virtual collaborator on the shared op-log + awareness (cursor, presence, follow), driven via D-Bus/MCP, relayed to remote peers. |

## Glossary

Terms used across multiple docs.

- **Session-singleton** — a single `ex.Entity` named `session-state` in each `MapScene`'s world. Holds editor-state and mode-marker components. Lifetime: per-scene. Lifecycle helper: `SessionState` in `packages/engine/src/utils/session-state.ts`.
- **Mode marker** — a component on the session-singleton whose mere presence flips a mode on (`EditorModeComponent`, `RuntimeModeComponent`, `GhostSpawnComponent`). Adding/removing the component is the mode transition.
- **Placement** — one instance of an object on a map at `(tileX, tileY)` on a referenced `layerId`. Carries either a `defId` (library reference) or an `inline` definition. Lives in `MapData.objectPlacements`.
- **Definition** — the reusable shape an object instance refers to: `kind`, optional `sprite`, optional `trigger`, optional `blocking`, kind-specific `properties`. Library entries live in `GameProjectData.objectLibrary`.
- **Library** — `GameProjectData.objectLibrary[]`, the project-level pool of reusable `ObjectDefinition`s. Editing one entry updates every placement that references it via `defId`.
- **Kind** — the semantic discriminator on an `ObjectDefinition`: `event | teleport | item | npc | spawn-point | custom`. Drives editor UX (library category, default trigger mode, default `blocking`) and component composition at spawn time.
- **Ghost spawn** — a runtime-only override of where the player spawns, used by Live Run. Stored in `SpawnOverrideComponent` on the singleton; does **not** modify the map data.
- **Subscription bridge** — the `SessionState.subscribe(scene, ComponentCtor, listener)` helper that lets GTK widgets observe singleton-component changes (add, remove, in-place mutation via `notifyMutation`).
- **Operation (Op)** — a typed mutation message in the form `{ kind, payload, peerId, seq }`. The unit of synchronisation in the op-log + host-sequencer model. Editor mutations, game events, and undo commands are all ops.
- **Op-log** — the sequence of operations applied to a session, in host-assigned order. Both the editor and game flows multiplex over the same op-log mechanism with different op vocabularies.
- **Host / Sequencer** — Player 1, the peer who opened the project. Receives ops from all peers, validates + assigns `seq`, broadcasts. Only one host per session.
