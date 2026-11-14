import type { ComponentData, EntityDefinition, ObjectPlacement } from '../types/data/index.ts'

/** The override block of an {@link ObjectPlacement}, named for readability. */
export type PlacementOverrides = NonNullable<ObjectPlacement['overrides']>

/**
 * Structural equality over JSON-shaped values — the schema is
 * JSON-serialisable by contract (see `AGENTS.md`, transport-friendly
 * schema), so there are no classes, dates or cycles to worry about.
 *
 * `JSON.stringify` comparison would be shorter but key ORDER would
 * decide: a component the inspector rebuilt field by field carries the
 * same data in whatever order the spec lists it, and a string compare
 * would call that an override.
 */
function sameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => sameJsonValue(item, b[i]))
  }
  if (typeof a !== 'object') return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!sameJsonValue(left[key], right[key])) return false
  }
  return true
}

/**
 * The inverse of `mergePlacementComponents`: given the base definition
 * a placement resolves to and the definition as the user just edited
 * it, return the per-instance overrides that reproduce the edit — or
 * `undefined` when the edit left nothing to override.
 *
 * Only DIFFERENCES ride along, so a placement whose component the user
 * edited and then set back to the library's value stops carrying an
 * override at all. That keeps a map file from filling with copies of
 * the library.
 *
 * **A component on the base cannot be removed per placement.** The
 * override model replaces wholesale per `type` and has no tombstone, so
 * a type missing from `edited` is NOT a deletion — it simply isn't
 * overridden and the base's component shows through. Hosts therefore
 * offer "remove" only for the types the placement itself added
 * (`EntityComponentsEditor.setNonRemovableTypes`).
 */
export function placementOverridesFrom(
  base: Pick<EntityDefinition, 'name' | 'components'>,
  edited: Pick<EntityDefinition, 'name' | 'components'>,
): PlacementOverrides | undefined {
  const components: ComponentData[] = []
  for (const component of edited.components) {
    const baseComponent = base.components.find((candidate) => candidate.type === component.type)
    if (baseComponent && sameJsonValue(baseComponent, component)) continue
    components.push({ ...component })
  }
  const overrides: PlacementOverrides = {}
  if (edited.name !== base.name) overrides.name = edited.name
  if (components.length) overrides.components = components
  return overrides.name === undefined && !overrides.components ? undefined : overrides
}
