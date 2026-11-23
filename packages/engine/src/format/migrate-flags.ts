import type { ActionData } from '../types/data/ActionData.ts'
import type { ComponentData, EntityDefinition, FlagValue } from '../types/data/EntityDefinition.ts'
import { type FlagData, defaultFlagInitial, flagIdFromName, flagKindOfValue } from '../types/data/FlagData.ts'
import type { GameProjectData } from '../types/data/GameProjectData.ts'
import type { MapData } from '../types/data/MapData.ts'

/**
 * Flags used to be free-text KEYS: a `set-flag` action and a state's
 * `when` each carried the name the author typed, and the store was a bag
 * keyed by that string. They are now project data with a stable `id`, and
 * every reference carries the id. This module is the one-way bridge for
 * projects written before that — pure, in place, idempotent (a reference
 * that is already an id maps to itself, see {@link flagIdFromName}).
 */

/** One place a definition names a flag; the object is the live reference, so a caller may rewrite `flag`. */
export interface FlagRef {
  readonly role: 'set' | 'when'
  /** The `set-flag` action or the `StateCondition` itself. */
  readonly holder: { flag: string }
  /** The value a `set-flag` writes / a condition compares to; `undefined` = the default `true`. */
  readonly value: FlagValue | undefined
}

function visitActions(actions: unknown, visit: (ref: FlagRef) => void): void {
  if (!Array.isArray(actions)) return
  for (const raw of actions as ActionData[]) {
    if (raw == null || typeof raw !== 'object') continue
    if (raw.type === 'set-flag') visit({ role: 'set', holder: raw, value: raw.value })
    else if (raw.type === 'change-counter') visit({ role: 'set', holder: raw, value: raw.amount })
    else if (raw.type === 'ask' && Array.isArray(raw.options)) {
      for (const option of raw.options) visitActions(option?.actions, visit)
    }
  }
}

/** Every flag reference in a component list (the `actions` component, nested `ask` answers included). */
export function visitComponentFlagRefs(
  components: readonly ComponentData[] | undefined,
  visit: (ref: FlagRef) => void,
) {
  for (const component of components ?? []) {
    if (component?.type === 'actions') visitActions((component as { actions?: unknown }).actions, visit)
  }
}

/** Every flag a condition reads: the shorthand, each typed leaf, and the leaves inside all / any / not. */
function visitConditionFlagRefs(when: unknown, visit: (ref: FlagRef) => void): void {
  if (when == null || typeof when !== 'object') return
  const c = when as { type?: unknown; of?: unknown; flag?: unknown; equals?: FlagValue; value?: unknown }
  if (c.type === 'all' || c.type === 'any') {
    if (Array.isArray(c.of)) for (const leaf of c.of) visitConditionFlagRefs(leaf, visit)
    return
  }
  if (c.type === 'not') {
    visitConditionFlagRefs(c.of, visit)
    return
  }
  if (typeof c.flag !== 'string') return
  const value = c.type === 'counter' ? (c.value as FlagValue) : c.equals
  visit({ role: 'when', holder: when as { flag: string }, value })
}

/** Every flag reference in one definition: its own actions and each state's condition + overlay. */
export function visitDefinitionFlagRefs(def: EntityDefinition | undefined, visit: (ref: FlagRef) => void): void {
  if (!def) return
  visitComponentFlagRefs(def.components, visit)
  for (const state of def.states ?? []) {
    visitConditionFlagRefs(state.when, visit)
    visitComponentFlagRefs(state.components, visit)
  }
}

/** Every flag reference of a map's placements (inline definitions and per-instance overrides). */
export function visitMapFlagRefs(map: Pick<MapData, 'objectPlacements'>, visit: (ref: FlagRef) => void): void {
  for (const placement of map.objectPlacements ?? []) {
    visitDefinitionFlagRefs(placement.inline, visit)
    visitComponentFlagRefs(placement.overrides?.components, visit)
  }
}

/** Rewrites each reference's name to its id; collects what the references say about the flag. */
function adoptRefs(flags: FlagData[], visitAll: (visit: (ref: FlagRef) => void) => void): void {
  const known = new Map(flags.map((f) => [f.id, f]))
  visitAll((ref) => {
    const name = ref.holder.flag
    if (name.length === 0) return
    const id = flagIdFromName(name)
    ref.holder.flag = id
    if (known.has(id)) return
    const kind = flagKindOfValue(ref.value)
    const entry: FlagData = { id, name, kind, initial: defaultFlagInitial(kind), scope: 'game' }
    known.set(id, entry)
    flags.push(entry)
  })
}

/** Bring a freshly parsed project up to named flags: library references become ids, entries are created. */
export function migrateProjectFlags(data: GameProjectData): GameProjectData {
  const flags = data.flags ? [...data.flags] : []
  adoptRefs(flags, (visit) => {
    for (const def of data.entityLibrary ?? []) visitDefinitionFlagRefs(def, visit)
  })
  if (flags.length > 0 || data.flags !== undefined) data.flags = flags
  return data
}

/**
 * Bring a loaded map up to named flags against its project: placement
 * references become ids and a flag only the map used is added to the
 * project. Needs the project because the readable name only exists in the
 * old file — the id is all that is left afterwards. Returns whether
 * anything changed.
 */
export function migrateMapFlags(project: GameProjectData, map: MapData): boolean {
  const flags = project.flags ? [...project.flags] : []
  const before = flags.length
  let rewritten = false
  adoptRefs(flags, (visit) => {
    visitMapFlagRefs(map, (ref) => {
      const was = ref.holder.flag
      visit(ref)
      if (ref.holder.flag !== was) rewritten = true
    })
  })
  if (flags.length !== before) project.flags = flags
  return rewritten || flags.length !== before
}

/** Where a flag is referenced; used to refuse removing one that is in use. */
export interface FlagUsage {
  /** `'entity'`: a library definition; `'map'`: a placement on that map. */
  where: 'entity' | 'map'
  /** The entity id or the map id. */
  id: string
}

/** Every definition and map that references `flagId`, each listed once. */
export function findFlagUsage(
  data: Pick<GameProjectData, 'entityLibrary'>,
  maps: readonly Pick<MapData, 'id' | 'objectPlacements'>[],
  flagId: string,
): FlagUsage[] {
  const out: FlagUsage[] = []
  for (const def of data.entityLibrary ?? []) {
    let hit = false
    visitDefinitionFlagRefs(def, (ref) => {
      if (ref.holder.flag === flagId) hit = true
    })
    if (hit) out.push({ where: 'entity', id: def.id })
  }
  for (const map of maps) {
    let hit = false
    visitMapFlagRefs(map, (ref) => {
      if (ref.holder.flag === flagId) hit = true
    })
    if (hit) out.push({ where: 'map', id: map.id })
  }
  return out
}
