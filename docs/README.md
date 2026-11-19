# Documentation

This folder collects extended documentation for contributors. For a project overview, start at the [root README](../README.md).

## Contents

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, the two traps that produce a green build with broken behaviour, commands, naming, what CI gates
- [concepts/](concepts/) — living design docs for cross-cutting decisions (index + maintenance rules inside)
- [design/](design/) — per-initiative design plans: the [UI redesign](design/ui-redesign/REDESIGN.md) and the
  measured [Excalibur 1.0 plan](design/excalibur-1.md) (frame-pacing baseline, attribution, migration, phased steps),
  and the [RPG Maker concept study](design/rpg-maker-concepts.md) (have/gap matrix, design decisions, game-feature
  roadmap; reports in [design/rpg-maker-research/](design/rpg-maker-research/), EasyRPG sources as shallow
  submodules under `refs/`)
- [reports/](reports/) — bug-report handoffs to external projects (e.g. gjsify)
- [screenshots/](screenshots/) — visual reference of every top-level view at three responsive
  form factors (desktop / tablet / phone), captured over the `Control` D-Bus interface
- [assets/](assets/) — other static assets used in docs

## See also

- [AGENTS.md](../AGENTS.md) — coding conventions, ECS patterns, GTK4 lifecycle, Blueprint, Storybook
- Per-package READMEs under [packages/](../packages/) and [apps/](../apps/) explain the role of each workspace
