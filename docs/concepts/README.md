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
- **Status header** at the top of each concept doc: `Status: planning | active | superseded`, plus the date of the last meaningful change.
- **Cross-link**: every concept doc cites the package(s) and file path(s) where the concept is implemented. When you refactor, update the citations.
- **One concept per file.** If two concepts are getting tangled, split them.
- **In-doc trackers are TODOs.** When a doc carries a rollout / phase table, an "Open questions" section, or a "Where this is implemented" list, those are first-class tasks — update them in the same commit that lands the implementation. Flip `planned → landed`, strike resolved open questions, refresh citations to point at real files. The same rule that governs the workspace-level `TODO.md` (no drift, update in the same commit, no "done" archive) applies inside concept docs.

## Index

| File | Status | What it covers |
|---|---|---|
| [`object-system.md`](object-system.md) | planning | The Definition/Placement model for tiles, objects, NPCs, items, teleports, and spawn points — plus how they map onto Excalibur's ECS |
