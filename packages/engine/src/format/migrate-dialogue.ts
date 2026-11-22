import type { ComponentData, EntityDefinition, GameProjectData, MapData } from '../types/data/index.ts'

/**
 * `dialogue` used to carry a `dialogueId` that nothing resolved. It now
 * carries `lines`. The old id pointed at no text, so the migrated
 * component keeps its place with no lines (and says nothing) instead of
 * inventing any.
 */
function migrateComponent(component: ComponentData): ComponentData {
  if (component.type !== 'dialogue' || !('dialogueId' in component)) return component
  const { dialogueId: _gone, ...rest } = component as ComponentData & { dialogueId?: unknown }
  return { ...rest, type: 'dialogue', lines: Array.isArray(rest.lines) ? rest.lines : [] }
}

function migrateComponents(list: ComponentData[] | undefined): void {
  if (!Array.isArray(list)) return
  list.forEach((c, i) => {
    list[i] = migrateComponent(c)
  })
}

function migrateDefinition(def: EntityDefinition | undefined): void {
  if (!def) return
  migrateComponents(def.components)
  for (const state of def.states ?? []) migrateComponents(state.components)
}

/** Bring a freshly parsed project up to the current `dialogue` shape, in place. */
export function migrateProjectDialogue(data: GameProjectData): GameProjectData {
  for (const def of data.entityLibrary ?? []) migrateDefinition(def)
  return data
}

/** Bring a freshly parsed map up to the current `dialogue` shape, in place. */
export function migrateMapDialogue(data: MapData): MapData {
  for (const placement of data.objectPlacements ?? []) {
    migrateDefinition(placement.inline)
    migrateComponents(placement.overrides?.components)
  }
  return data
}
