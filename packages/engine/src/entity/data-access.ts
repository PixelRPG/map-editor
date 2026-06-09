import type { ComponentData, EntityDefinition } from '../types/data/index.ts'

/**
 * Read one component's data off a definition by `type`. Returns the
 * first match (a definition shouldn't carry two of the same type) or
 * `undefined`. The caller narrows the result.
 *
 * Used by systems that read definition data directly rather than from a
 * runtime component (e.g. `PlayerSystem` reading `movement.tilesPerSec`).
 */
export function getComponentData<T extends ComponentData = ComponentData>(
  def: Pick<EntityDefinition, 'components'>,
  type: string,
): T | undefined {
  return def.components.find((c) => c.type === type) as T | undefined
}

/**
 * Merge a placement's per-instance component overrides onto a base
 * definition's components — **wholesale-replace per `type`** (same
 * discipline as the shipped placement overrides: no deep merge). An
 * override component replaces the base component of the same type; an
 * override type not present on the base is appended.
 *
 * Returns a fresh array (inputs untouched), preserving base order with
 * new types appended.
 */
export function mergePlacementComponents(
  base: readonly ComponentData[],
  overrides?: readonly ComponentData[],
): ComponentData[] {
  if (!overrides || overrides.length === 0) return base.map((c) => ({ ...c }))
  const overrideByType = new Map(overrides.map((c) => [c.type, c]))
  const merged: ComponentData[] = base.map((c) => {
    const o = overrideByType.get(c.type)
    if (o) overrideByType.delete(c.type)
    return { ...(o ?? c) }
  })
  // Override types not on the base are additive.
  for (const o of overrideByType.values()) merged.push({ ...o })
  return merged
}
