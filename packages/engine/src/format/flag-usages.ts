import type { ActionData } from '../types/data/ActionData.ts'
import type { ComponentData, EntityDefinition } from '../types/data/EntityDefinition.ts'
import type { GameProjectData } from '../types/data/GameProjectData.ts'
import type { MapData } from '../types/data/MapData.ts'

/**
 * "Where is this flag used?" — one pure pass over a project that lists
 * every place a flag is read or written, so the editor can show the list
 * and refuse to remove a flag something still names. This is the single
 * source of truth: the removal check and the "Used in" list both read it.
 */

/** How a place touches the flag: a condition reads it, an action writes it. */
export type FlagAccess = 'read' | 'write'

/** Which piece of data names the flag. */
export type FlagUsageVia = 'condition' | 'set-flag' | 'change-counter'

/** One place that reads or writes one flag. */
export interface FlagUsage {
  flagId: string
  access: FlagAccess
  via: FlagUsageVia
  /** The map holding the placement; `null` for a library definition. */
  mapId: string | null
  /** The placement; `null` for a library definition. */
  placementId: string | null
  /** The definition: the library entry, a placement's `defId`, or its inline definition. */
  entityId: string
  /** Index into the definition's `states`; `null` for the base components (or an override). */
  stateIndex: number | null
  /** Index of the action in its `actions` list (a nested `ask` answer reports the `ask`'s index); `null` for a condition. */
  actionIndex: number | null
}

type Emit = (
  flagId: string,
  access: FlagAccess,
  via: FlagUsageVia,
  stateIndex: number | null,
  actionIndex: number | null,
) => void

function walkActions(actions: unknown, stateIndex: number | null, emit: Emit, outerIndex: number | null): void {
  if (!Array.isArray(actions)) return
  actions.forEach((raw: ActionData | null, i) => {
    if (raw == null || typeof raw !== 'object') return
    const index = outerIndex ?? i
    if (raw.type === 'set-flag' && typeof raw.flag === 'string') emit(raw.flag, 'write', 'set-flag', stateIndex, index)
    else if (raw.type === 'change-counter' && typeof raw.flag === 'string') {
      emit(raw.flag, 'write', 'change-counter', stateIndex, index)
    } else if (raw.type === 'ask' && Array.isArray(raw.options)) {
      for (const option of raw.options) walkActions(option?.actions, stateIndex, emit, index)
    }
  })
}

function walkComponents(components: readonly ComponentData[] | undefined, stateIndex: number | null, emit: Emit): void {
  for (const component of components ?? []) {
    if (component?.type === 'actions') {
      walkActions((component as { actions?: unknown }).actions, stateIndex, emit, null)
    }
  }
}

/** The shorthand, each typed leaf, and the leaves inside all / any / not. */
function walkCondition(when: unknown, stateIndex: number, emit: Emit): void {
  if (when == null || typeof when !== 'object') return
  const c = when as { type?: unknown; of?: unknown; flag?: unknown }
  if (c.type === 'all' || c.type === 'any') {
    if (Array.isArray(c.of)) for (const leaf of c.of) walkCondition(leaf, stateIndex, emit)
    return
  }
  if (c.type === 'not') {
    walkCondition(c.of, stateIndex, emit)
    return
  }
  if (typeof c.flag === 'string') emit(c.flag, 'read', 'condition', stateIndex, null)
}

function walkDefinition(def: EntityDefinition | undefined, emit: Emit): void {
  if (!def) return
  walkComponents(def.components, null, emit)
  def.states?.forEach((state, i) => {
    walkCondition(state.when, i, emit)
    walkComponents(state.components, i, emit)
  })
}

/**
 * Every flag usage in the project, grouped by flag id (in the order found:
 * library definitions first, then each map's placements). Flags nothing
 * names are absent from the result.
 */
export function findFlagUsages(
  data: Pick<GameProjectData, 'entityLibrary'>,
  maps: readonly Pick<MapData, 'id' | 'objectPlacements'>[],
): Map<string, FlagUsage[]> {
  const out = new Map<string, FlagUsage[]>()
  const collector =
    (mapId: string | null, placementId: string | null, entityId: string): Emit =>
    (flagId, access, via, stateIndex, actionIndex) => {
      if (flagId.length === 0) return
      const list = out.get(flagId) ?? []
      list.push({
        flagId,
        access,
        via,
        mapId,
        placementId,
        entityId,
        stateIndex,
        actionIndex,
      })
      out.set(flagId, list)
    }

  for (const def of data.entityLibrary ?? []) walkDefinition(def, collector(null, null, def.id))
  for (const map of maps) {
    for (const placement of map.objectPlacements ?? []) {
      const entityId = placement.defId ?? placement.inline?.id ?? placement.id
      const emit = collector(map.id, placement.id, entityId)
      walkDefinition(placement.inline, emit)
      walkComponents(placement.overrides?.components, null, emit)
    }
  }
  return out
}
