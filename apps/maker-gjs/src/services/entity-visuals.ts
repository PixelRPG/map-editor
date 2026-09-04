import { BUILT_IN_COMPONENT_SPECS, type EntityDefinition, getComponentData } from '@pixelrpg/engine'

/** The sprite reference of a definition's `visual` component, if any. */
export function visualOf(def: EntityDefinition | null): { spriteSetId: string; spriteId: number } | null {
  const v = def ? getComponentData(def, 'visual') : undefined
  if (v && typeof v.spriteSetId === 'string') {
    return { spriteSetId: v.spriteSetId, spriteId: typeof v.spriteId === 'number' ? v.spriteId : 0 }
  }
  return null
}

/**
 * Priority order for a placement row's icon when it has no sprite — the
 * dominant component's editor icon wins, mirroring the spawn-marker
 * priority.
 */
const OBJECT_ICON_PRIORITY = ['teleport', 'item', 'spawn-point', 'npc-route', 'dialogue', 'trigger']

/** The row icon for `def`, or `undefined` so the tab uses its fallback. */
export function iconOf(def: EntityDefinition | null): string | undefined {
  if (!def) return undefined
  const types = new Set(def.components.map((c) => c.type))
  for (const t of OBJECT_ICON_PRIORITY) {
    if (types.has(t)) return BUILT_IN_COMPONENT_SPECS[t]?.editor.icon
  }
  return undefined
}

/**
 * Whether an entity can be promoted into the Cast roster: it needs a
 * `visual` naming a real appearance. Teleports / events and
 * visual-but-appearance-less entities are excluded — promoting those
 * would flip the marker while Cast still filtered them out.
 */
export function canBeCastMember(def: EntityDefinition): boolean {
  const visual = visualOf(def)
  return visual != null && visual.spriteSetId.length > 0
}
