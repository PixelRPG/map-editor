import type { ComponentData, EntityDefinition, EntityState } from '../types/data/index.ts'
import { isStateCondition } from '../types/data/EntityDefinition.ts'
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
      // A `select` with no options is a mis-declared spec: the inspector
      // renders a closed ComboRow but validation would accept any string.
      // Reject it as a spec error rather than let it behave as free text.
      if (!field.options || field.options.length === 0) return `"${field.key}" select field has no options`
      if (!field.options.some((o) => o.value === value)) return `"${field.key}" has an invalid option`
      break
    case 'facing':
      if (typeof value !== 'string' || !FACINGS.has(value)) return `"${field.key}" must be a facing direction`
      break
    case 'json':
      // Accept any JSON-serialisable value, but reject the shapes that
      // violate transport rule 4 (no functions / BigInt / Map/Set, no
      // circular references — AGENTS.md): this boundary is where the
      // op-log's serialisability contract is enforced.
      if (!isJsonSerialisable(value)) return `"${field.key}" must be JSON-serialisable`
      break
  }
  return null
}

/**
 * Cheap structural guard for the `json` field input: rejects functions,
 * symbols, BigInt and `Map`/`Set` (which `JSON.stringify` silently drops
 * or mangles) and circular references (which throw). Plain
 * objects/arrays/primitives pass.
 */
function isJsonSerialisable(value: unknown): boolean {
  const t = typeof value
  if (t === 'function' || t === 'symbol' || t === 'bigint') return false
  if (value instanceof Map || value instanceof Set) return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
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
  // Deep validation the flat field DSL can't express (e.g. the actions
  // spec's discriminated-union list behind a single `json` field).
  if (spec.validate) errors.push(...spec.validate(data).map((e) => `${spec.type}: ${e}`))
  return errors
}

/**
 * The three outcomes a definition check can produce. Keeping them apart
 * is the whole point: **disabled data is preserved and inert, unknown
 * data is rejected.** Merging the two would either make a typo silent or
 * make switching a game system off destructive.
 */
export interface EntityValidationResult {
  /** Hard failures — an unregistered type, a wrong field type, a duplicate. */
  errors: string[]
  /** Saved, understood, but not acted on by this build. Never blocks. */
  warnings: string[]
  /** Component types owned by a game system this project has switched OFF. */
  dormant: string[]
}

/** Options for {@link validateEntityDefinitionDetailed}. */
export interface EntityValidationOptions {
  /**
   * The components this project may actually use — normally
   * `effectiveComponentRegistry(project)`. Defaults to every built-in.
   */
  registry?: ComponentSpecRegistry
  /**
   * Enforce per-field `required`. The save path leaves it false (a draft
   * may have empty required fields); a spawn / publish gate passes true.
   */
  requireComplete?: boolean
  /**
   * Every component type this BUILD knows, enabled or not. A type in here
   * but absent from `registry` is dormant rather than unknown. Defaults
   * to `registry`, i.e. nothing is dormant unless a caller says so.
   */
  knownRegistry?: ComponentSpecRegistry
}

/**
 * Registry-aware validation of an entity definition, with the dormant and
 * warning channels separated from hard errors.
 *
 * **Always fails loudly on an unregistered component `type`** (the
 * concept's no-silent-skip rule) and on wrong field *types*. Warns —
 * never fails — on a state condition this build cannot evaluate and on a
 * state overlay carrying a component type the runtime cannot yet swap, so
 * a project written by a newer editor opens with reduced behaviour
 * instead of an error.
 */
export function validateEntityDefinitionDetailed(
  def: EntityDefinition,
  options: EntityValidationOptions = {},
): EntityValidationResult {
  const registry = options.registry ?? BUILT_IN_COMPONENT_SPECS
  const knownRegistry = options.knownRegistry ?? registry
  const requireComplete = options.requireComplete ?? false
  const result: EntityValidationResult = { errors: [], warnings: [], dormant: [] }

  if (typeof def.id !== 'string' || def.id.length === 0) result.errors.push('Entity definition is missing an id')
  if (typeof def.name !== 'string') result.errors.push(`Entity "${def.id}" is missing a name`)
  if (!Array.isArray(def.components)) {
    result.errors.push(`Entity "${def.id}" has no components array`)
    return result
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
        if (knownRegistry[comp.type]) {
          // Known component, disabled system: keep the data, skip the
          // field check (an incomplete dormant component must not block
          // a spawn) and let the inspector explain the grey rows.
          if (!result.dormant.includes(comp.type)) result.dormant.push(comp.type)
          continue
        }
        result.errors.push(`Entity "${def.id}" ${where} references unregistered component type "${comp.type}"`)
        continue
      }
      if (seenTypes.has(comp.type)) {
        result.errors.push(`Entity "${def.id}" ${where} has a duplicate component type "${comp.type}"`)
      }
      seenTypes.add(comp.type)
      result.errors.push(...validateComponentData(spec, comp, requireComplete))
    }
  }

  validateList(def.components, 'components')
  for (const state of def.states ?? []) {
    validateList(state.components, `state "${state.id}"`)
    validateStateCondition(def, state, result)
    validateStateOverlay(def, state, result)
  }
  return result
}

/**
 * A `when` outside the one supported shape is a warning, not an error:
 * `StateSystem` never matches it, so the state simply stays inactive and
 * the project still opens. Errors here would make a template from a
 * newer editor unopenable.
 */
function validateStateCondition(def: EntityDefinition, state: EntityState, result: EntityValidationResult): void {
  if (state.when === undefined || isStateCondition(state.when)) return
  result.warnings.push(
    `Entity "${def.id}" state "${state.id}" has a condition this editor does not understand — ` +
      'only "when a flag is set" works here, so the state will never activate',
  )
}

/**
 * Only an `actions` overlay has a runtime today. Everything else is
 * saved, round-trips and stays inert — say so rather than let the author
 * believe the door will look open.
 */
function validateStateOverlay(def: EntityDefinition, state: EntityState, result: EntityValidationResult): void {
  const inert = state.components.filter((c) => c.type !== 'actions').map((c) => c.type)
  if (inert.length === 0) return
  result.warnings.push(
    `Entity "${def.id}" state "${state.id}" changes ${inert.join(', ')} — only Behaviour can change with a flag ` +
      'yet, so the rest is saved but has no effect',
  )
}

/**
 * Registry-aware validation of an entity definition, errors only —
 * the shape every existing caller (format load, spawn warnings) uses.
 * See {@link validateEntityDefinitionDetailed} for the warning + dormant
 * channels.
 */
export function validateEntityDefinition(
  def: EntityDefinition,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
  requireComplete = false,
): string[] {
  return validateEntityDefinitionDetailed(def, { registry, requireComplete }).errors
}
