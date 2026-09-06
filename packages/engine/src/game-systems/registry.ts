import type { ComponentSpecRegistry } from '../entity/component-spec.ts'
import type { GameProjectData } from '../types/data/GameProjectData.ts'
import type { GameSystemSpec } from './game-system-spec.ts'
import { combatActionGameSystem } from './specs/combat-action.ts'
import { coreGameSystem } from './specs/core.ts'
import { inventoryGameSystem } from './specs/inventory.ts'
import { statsGameSystem } from './specs/stats.ts'

/**
 * Built-in game systems, keyed by stable `id` — the same discipline as
 * `BUILT_IN_COMMANDS` and for the same reason: an id that isn't here
 * can't be reconstructed on a peer, so a project naming it must degrade
 * predictably rather than half-work.
 *
 * Completeness (every shipped `specs/*.ts` registered, no stale entries)
 * and component ownership are auto-enforced by `registry.spec.ts`.
 *
 * **Insertion order is the runtime order** `MapScene` adds each system's
 * ECS systems in, so it is load-bearing rather than cosmetic: `core`
 * spawns the hero and writes its velocity, `stats` seeds the live hit
 * points, and `combat-action` reads both — and its own pushback has to
 * land after every earlier writer has set its velocity for the tick.
 */
export const BUILT_IN_GAME_SYSTEMS: Record<string, GameSystemSpec> = {
  [coreGameSystem.id]: coreGameSystem,
  [statsGameSystem.id]: statsGameSystem,
  [inventoryGameSystem.id]: inventoryGameSystem,
  [combatActionGameSystem.id]: combatActionGameSystem,
}

/** A project's per-system record: whether it's on, plus its settings. */
export type GameSystemSettings = NonNullable<GameProjectData['gameSystems']>

/** The subset of a project this module needs — so callers can pass a fixture. */
type SystemsCarrier = Pick<GameProjectData, 'gameSystems'>

/**
 * Is `spec` active for `project`? Base systems always are; everything
 * else needs an explicit `enabled: true`. An ABSENT entry means off, so
 * a project written before a system existed opens with it off rather
 * than silently gaining it.
 */
export function isGameSystemEnabled(spec: GameSystemSpec, project?: SystemsCarrier | null): boolean {
  if (spec.editor.base) return true
  return project?.gameSystems?.[spec.id]?.enabled === true
}

/**
 * The game systems a project actually runs: every base system plus every
 * enabled one, plus the transitive closure of their `requires` (enabling
 * a system enables what it needs — the guard proves the graph closes over
 * registered ids and has no cycle, so this terminates).
 *
 * Returned in registry order, which is the order `MapScene` adds their
 * ECS systems in.
 */
export function effectiveGameSystems(
  project?: SystemsCarrier | null,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): GameSystemSpec[] {
  const wanted = new Set<string>()
  const pull = (id: string): void => {
    if (wanted.has(id)) return
    const spec = systems[id]
    if (!spec) return // unknown id — reported at load, never fatal
    wanted.add(id)
    for (const required of spec.requires ?? []) pull(required)
  }
  for (const spec of Object.values(systems)) {
    if (isGameSystemEnabled(spec, project)) pull(spec.id)
  }
  return Object.values(systems).filter((spec) => wanted.has(spec.id))
}

/**
 * The components a project may actually use: the union of every
 * effective system's `components`.
 *
 * This is what `validateEntityDefinition`, `buildPlacementEntity`,
 * `placementSpawnWarnings`, `markerColorFor` and the components editor
 * should be handed. A component of a system this build knows but the
 * project has switched OFF is absent from here on purpose — it is
 * *dormant* (preserved, inert, reported as such), which is a different
 * thing from unknown (a typo, rejected loudly).
 */
export function effectiveComponentRegistry(
  project?: SystemsCarrier | null,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): ComponentSpecRegistry {
  const registry: ComponentSpecRegistry = {}
  for (const spec of effectiveGameSystems(project, systems)) {
    for (const component of spec.components) registry[component.type] = component
  }
  return registry
}

/**
 * Game-system ids the project names that this build does not have.
 *
 * Reported, never fatal: a project or template made in a newer editor
 * must still open, with that system's components dormant. Ignoring the
 * ids silently would instead make a typo indistinguishable from a
 * newer feature.
 */
export function unknownGameSystemIds(
  project?: SystemsCarrier | null,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): string[] {
  return Object.keys(project?.gameSystems ?? {}).filter((id) => !systems[id])
}

/**
 * Enabled-set edit: flip one system on or off and return the WHOLE
 * record to store and broadcast (wholesale + idempotent, the same
 * discipline as `__project/meta.update`). Enabling pulls in `requires`;
 * disabling never removes data — see `docs/concepts/game-systems.md`
 * § Off means dormant.
 *
 * Pure: the caller (the maker's `ProjectStore`) owns persist + broadcast.
 */
export function withGameSystemEnabled(
  current: GameSystemSettings | undefined,
  id: string,
  enabled: boolean,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): GameSystemSettings {
  const next: GameSystemSettings = { ...current }
  const apply = (systemId: string): void => {
    if (next[systemId]?.enabled === true) return
    next[systemId] = { ...next[systemId], enabled: true }
    for (const required of systems[systemId]?.requires ?? []) apply(required)
  }
  if (enabled) apply(id)
  else next[id] = { ...next[id], enabled: false }
  return next
}

/**
 * Enabled systems that require `id` — the reason its switch is
 * insensitive. Empty when nothing depends on it.
 */
export function enabledDependentsOf(
  id: string,
  project?: SystemsCarrier | null,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): GameSystemSpec[] {
  return effectiveGameSystems(project, systems).filter((spec) => spec.id !== id && (spec.requires ?? []).includes(id))
}
