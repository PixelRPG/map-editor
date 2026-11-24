import { type FlagAccess, type FlagData, type FlagKind, type MapData, findFlagUsages } from '@pixelrpg/engine'
import type { GameProjectData } from '@pixelrpg/engine'

import type { CheckupLink } from './game-checkup.model.ts'

/**
 * The Game page's Flags section as facts: one row per flag with every
 * place that reads or writes it. String-free like `game-checkup.model.ts`;
 * `widgets/game/flags-list.ts` owns the words.
 */

/** One place a flag is used, with where a tap goes. */
export interface FlagUsageRow {
  /** Unique within its flag (a flag can be used twice by one thing). */
  readonly key: string
  readonly access: FlagAccess
  /** The thing's name (a placement's own name wins over its definition's). */
  readonly thingName: string
  /** The map it stands on, or `null` for a library thing not placed here. */
  readonly mapName: string | null
  readonly link: CheckupLink | null
}

/** One flag and its usages. */
export interface FlagRow {
  readonly id: string
  readonly name: string
  readonly kind: FlagKind
  readonly usages: readonly FlagUsageRow[]
}

export interface FlagsModelInput {
  readonly project: Pick<GameProjectData, 'entityLibrary' | 'flags'>
  readonly maps: readonly MapData[]
  /** Ids of library entries that are characters: their tap opens the Cast. */
  readonly characterIds: readonly string[]
}

/** Every flag, named flags first by their order in the project; unnamed ids a project still uses follow. */
export function buildFlagRows(input: FlagsModelInput): FlagRow[] {
  const { project, maps, characterIds } = input
  const usages = findFlagUsages(project, maps)
  const defs = new Map((project.entityLibrary ?? []).map((d) => [d.id, d]))
  const mapById = new Map(maps.map((m) => [m.id, m]))
  const characters = new Set(characterIds)

  const rowFor = (flag: Pick<FlagData, 'id' | 'name' | 'kind'>): FlagRow => {
    const list = usages.get(flag.id) ?? []
    return {
      id: flag.id,
      name: flag.name,
      kind: flag.kind,
      usages: list.map((u, i) => {
        const map = u.mapId ? mapById.get(u.mapId) : undefined
        const placement = map?.objectPlacements?.find((p) => p.id === u.placementId)
        const def = defs.get(u.entityId)
        const thingName = placement?.overrides?.name?.trim() || def?.name || u.entityId
        const link: CheckupLink | null =
          u.mapId && u.placementId
            ? { action: 'win.focus-placement', target: [u.mapId, u.placementId] }
            : defs.has(u.entityId)
              ? { action: characters.has(u.entityId) ? 'win.open-character' : 'win.open-object', target: u.entityId }
              : null
        return {
          key: `${u.mapId ?? ''}/${u.placementId ?? u.entityId}/${u.stateIndex ?? ''}/${u.actionIndex ?? ''}/${u.access}/${i}`,
          access: u.access,
          thingName,
          mapName: map ? map.name?.trim() || map.id : null,
          link,
        }
      }),
    }
  }

  const rows = (project.flags ?? []).map(rowFor)
  const known = new Set(rows.map((r) => r.id))
  for (const id of usages.keys()) if (!known.has(id)) rows.push(rowFor({ id, name: id, kind: 'yes-no' }))
  return rows
}
