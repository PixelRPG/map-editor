import type { ComponentData, EntityDefinition } from '../types/data/index.ts'
import type { ComponentSpec, ComponentSpecRegistry, FieldDescriptor } from './component-spec.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'

const FACINGS = new Set(['up', 'down', 'left', 'right'])

/**
 * Validate one field's value against its descriptor. Returns an error
 * string or null. `requireComplete` gates the `required` check: a save /
 * draft passes `false` (an in-progress definition may leave required
 * fields empty — e.g. a freshly-templated NPC with no appearance chosen
 * yet), while a spawn / publish check passes `true`. Type errors on
 * *present* values are reported regardless.
 */
function validateField(field: FieldDescriptor, value: unknown, requireComplete: boolean): string | null {
  const present = value !== undefined && value !== null && !(typeof value === 'string' && value.length === 0)
  if (!present) return field.required && requireComplete ? `"${field.key}" is required` : null

  switch (field.input) {
    case 'text':
    case 'map-ref':
    case 'appearance-ref':
    case 'sprite-ref':
      if (typeof value !== 'string') return `"${field.key}" must be a string`
      break
    case 'int':
    case 'float': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `"${field.key}" must be a number`
      if (field.input === 'int' && !Number.isInteger(value)) return `"${field.key}" must be an integer`
      if (typeof field.min === 'number' && value < field.min) return `"${field.key}" must be ≥ ${field.min}`
      if (typeof field.max === 'number' && value > field.max) return `"${field.key}" must be ≤ ${field.max}`
      break
    }
    case 'bool':
      if (typeof value !== 'boolean') return `"${field.key}" must be a boolean`
      break
    case 'select':
      if (typeof value !== 'string') return `"${field.key}" must be a string`
      if (field.options && !field.options.some((o) => o.value === value)) return `"${field.key}" has an invalid option`
      break
    case 'facing':
      if (typeof value !== 'string' || !FACINGS.has(value)) return `"${field.key}" must be a facing direction`
      break
    case 'json':
      // Any JSON-serialisable value is accepted; objects/arrays/primitives all pass.
      break
  }
  return null
}

/**
 * Validate one component's data against its spec's field descriptors.
 * Returns a list of human-readable errors (empty = valid). `requireComplete`
 * (default false) gates the per-field `required` check — see {@link validateField}.
 */
export function validateComponentData(spec: ComponentSpec, data: ComponentData, requireComplete = false): string[] {
  const errors: string[] = []
  for (const field of spec.fields) {
    const err = validateField(field, data[field.key], requireComplete)
    if (err) errors.push(`${spec.type}: ${err}`)
  }
  return errors
}

/**
 * Registry-aware validation of an entity definition. **Always fails loudly
 * on an unregistered component `type`** (the concept's no-silent-skip rule)
 * and on wrong field *types*. The `requireComplete` flag (default false)
 * additionally enforces per-field `required`: the save path leaves it
 * false (a draft may have empty required fields), a spawn / publish gate
 * passes true. Returns a list of errors (empty = valid).
 */
export function validateEntityDefinition(
  def: EntityDefinition,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
  requireComplete = false,
): string[] {
  const errors: string[] = []
  if (typeof def.id !== 'string' || def.id.length === 0) errors.push('Entity definition is missing an id')
  if (typeof def.name !== 'string') errors.push(`Entity "${def.id}" is missing a name`)
  if (!Array.isArray(def.components)) {
    errors.push(`Entity "${def.id}" has no components array`)
    return errors
  }
  const validateList = (components: ComponentData[], where: string) => {
    // A component `type` must appear at most once per list: getComponentData
    // (data-access.ts) returns the FIRST match and the spawn pipeline builds
    // from it, so a second component of the same type is silently ignored at
    // runtime. Reject it here rather than let that drift go unnoticed.
    const seenTypes = new Set<string>()
    for (const comp of components) {
      const spec = registry[comp.type]
      if (!spec) {
        errors.push(`Entity "${def.id}" ${where} references unregistered component type "${comp.type}"`)
        continue
      }
      if (seenTypes.has(comp.type)) {
        errors.push(`Entity "${def.id}" ${where} has a duplicate component type "${comp.type}"`)
      }
      seenTypes.add(comp.type)
      errors.push(...validateComponentData(spec, comp, requireComplete))
    }
  }
  validateList(def.components, 'components')
  for (const state of def.states ?? []) validateList(state.components, `state "${state.id}"`)
  return errors
}
