import type { ComponentData, EntityDefinition, ObjectPlacement } from '../types/data/index.ts'

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

/**
 * Resolve a placement to its effective {@link EntityDefinition}: an inline
 * definition, or a library lookup by `defId` with per-instance
 * `overrides` merged (name replace + wholesale-replace components per
 * `type`). Returns `null` if neither resolves.
 *
 * This is the **single** placement→definition resolver — the spawn
 * pipeline, the maker's Objects tab and the atlas teleport overlay all
 * go through it, so `defId` placements (created by the object brush
 * since C3b) and per-placement overrides behave identically everywhere.
 */
export function resolvePlacementDefinition(
  placement: ObjectPlacement,
  library: readonly EntityDefinition[],
): EntityDefinition | null {
  let base: EntityDefinition | null = null
  if (placement.inline) base = placement.inline
  else if (placement.defId) base = library.find((d) => d.id === placement.defId) ?? null
  if (!base) return null
  if (!placement.overrides) return base
  return {
    ...base,
    name: placement.overrides.name ?? base.name,
    components: mergePlacementComponents(base.components, placement.overrides.components),
    // `...base` would alias `base.states` by reference. Components are
    // cloned by mergePlacementComponents; deep-clone states the same way
    // so a resolved override never shares mutable state data with the
    // library definition.
    ...(base.states
      ? { states: base.states.map((s) => ({ ...s, components: s.components.map((c) => ({ ...c })) })) }
      : {}),
  }
}
