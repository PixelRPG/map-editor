import {
  BUILT_IN_GAME_SYSTEMS,
  effectiveGameSystems,
  enabledDependentsOf,
  type EntityDefinition,
  type GameProjectData,
  type GameSystemSpec,
  type MapData,
} from '@pixelrpg/engine'

/**
 * The Game-rules page's model — what the Data view renders as one
 * `Adw.ExpanderRow` per switchable system plus an "Always on" group.
 *
 * Pure and free of GTK on purpose: the switchable path has no shipped
 * system to exercise it yet (only base systems exist in this build), so
 * a fixture-driven unit test is the only way this code can be proven at
 * all. See `game-rules-model.spec.ts`.
 */

/** One row on the Game-rules page. */
export interface GameRuleRow {
  /** Stable system id — what a switch flip writes into `gameSystems`. */
  id: string
  label: string
  /** The one sentence under the label. */
  kidLabel: string
  icon: string
  /**
   * Whether the system is EFFECTIVELY on — its own switch, or another
   * enabled system requiring it. A system pulled in by `requires` shows
   * its switch on and locked, because that is what is true.
   */
  enabled: boolean
  /** Labels of the systems turning this one on also turns on (`requires`). */
  alsoEnables: string[]
  /**
   * Labels of ENABLED systems that require this one. Non-empty means the
   * switch is locked: turning it off would leave a dependent half-wired.
   */
  neededBy: string[]
  /** How much of the project would go dormant if this system were switched off. */
  usage: GameRuleUsage
}

/** "3 objects · 12 placed on 2 maps" — the cost of switching a system off. */
export interface GameRuleUsage {
  /** Library entities carrying at least one component this system owns. */
  entities: number
  /** Placements of those entities across the maps that are loaded. */
  placements: number
  /** How many maps carry at least one such placement. */
  maps: number
}

/** The whole page: switchable rows plus the always-on floor. */
export interface GameRulesModel {
  switchable: GameRuleRow[]
  alwaysOn: GameRuleRow[]
}

/** What {@link buildGameRulesModel} needs — narrow so a test can pass literals. */
export interface GameRulesInput {
  project?: Pick<GameProjectData, 'gameSystems' | 'entityLibrary'> | null
  /** The map data currently loaded; placements in unloaded maps are not counted. */
  maps?: Iterable<Pick<MapData, 'objectPlacements'>>
  systems?: Record<string, GameSystemSpec>
}

/**
 * Build the Game-rules model for a project. Systems keep registry order,
 * so the page does not reshuffle when a switch is flipped.
 */
export function buildGameRulesModel(input: GameRulesInput = {}): GameRulesModel {
  const systems = input.systems ?? BUILT_IN_GAME_SYSTEMS
  const project = input.project ?? null
  const maps = [...(input.maps ?? [])]
  const effective = new Set(effectiveGameSystems(project, systems).map((s) => s.id))
  const model: GameRulesModel = { switchable: [], alwaysOn: [] }

  for (const spec of Object.values(systems)) {
    const row: GameRuleRow = {
      id: spec.id,
      label: spec.editor.label,
      kidLabel: spec.editor.kidLabel,
      icon: spec.editor.icon,
      enabled: effective.has(spec.id),
      alsoEnables: (spec.requires ?? []).map((id) => systems[id]?.editor.label ?? id),
      neededBy: enabledDependentsOf(spec.id, project, systems).map((s) => s.editor.label),
      usage: usageOf(spec, project?.entityLibrary ?? [], maps),
    }
    if (spec.editor.base) model.alwaysOn.push(row)
    else model.switchable.push(row)
  }
  return model
}

/**
 * How much of the project depends on one system: the library entities
 * carrying a component it owns, and how often those are placed.
 *
 * This is the number the switch-off dialogue quotes, so it has to be the
 * honest one — "12 objects keep their fighting settings but stop
 * fighting" is only reassuring if 12 is right.
 */
function usageOf(
  spec: GameSystemSpec,
  library: readonly EntityDefinition[],
  maps: readonly Pick<MapData, 'objectPlacements'>[],
): GameRuleUsage {
  const owned = new Set(spec.components.map((c) => c.type))
  const users = new Set<string>()
  for (const def of library) {
    const carries =
      def.components.some((c) => owned.has(c.type)) ||
      (def.states ?? []).some((state) => state.components.some((c) => owned.has(c.type)))
    if (carries) users.add(def.id)
  }

  let placements = 0
  let mapsWithPlacements = 0
  for (const map of maps) {
    const hits = (map.objectPlacements ?? []).filter(
      (p) => (p.defId && users.has(p.defId)) || (p.inline?.components ?? []).some((c) => owned.has(c.type)),
    ).length
    placements += hits
    if (hits > 0) mapsWithPlacements++
  }
  return { entities: users.size, placements, maps: mapsWithPlacements }
}
