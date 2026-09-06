import type { ComponentData, EntityDefinition, GameProjectData, MapData } from '../types/data/index.ts'
import type { ComponentSpec, ComponentSpecRegistry, FieldDescriptor } from './component-spec.ts'

/**
 * Simple view — the filter the editor's two view tiers share.
 *
 * The editor has two tiers, **Simple view** and **Full view**, and Simple
 * is a filter over the same widgets rather than a second widget tree:
 * this module is the one place that decides what the filter hides, so the
 * generated inspectors, the Add menu and the honesty signals all agree.
 * It is render-only by construction — nothing here touches data — and
 * the spawn pipeline never consults it, so a hidden component still
 * spawns, draws and fires.
 *
 * The rules (`docs/concepts/entity-and-appearance-model.md` § Simple view
 * and Full view):
 *
 * 1. A field renders in Simple iff `FieldDescriptor.basic`.
 * 2. A component renders in Simple iff `ComponentEditorMeta.basic`; the
 *    two flags are kept consistent by `registry.spec.ts`, so a basic field
 *    always sits in a basic component and a basic component with fields
 *    always has a basic field to show.
 * 3. A `json` field never renders raw in Simple — a basic one must have a
 *    bespoke editor (the widget package asserts that mapping is total).
 * 4. What Simple hides is COUNTED, never implied away: one per hidden
 *    component, one per hidden field whose value is set and differs from
 *    its default, so "Show 3 more settings" is exact.
 */

/** The fields Simple view renders for a component: the ones flagged `basic`. */
export function simpleViewFields(spec: Pick<ComponentSpec, 'fields'>): FieldDescriptor[] {
  return spec.fields.filter((field) => field.basic === true)
}

/** The fields Simple view hides for a component. */
export function hiddenFields(spec: Pick<ComponentSpec, 'fields'>): FieldDescriptor[] {
  return spec.fields.filter((field) => field.basic !== true)
}

/** Whether Simple view renders this component at all (rule 2). */
export function isSimpleViewComponent(spec: Pick<ComponentSpec, 'editor'>): boolean {
  return spec.editor.basic === true
}

/**
 * The subset of a registry Simple view offers — what the Add menu lists
 * and what the inspectors render. Full view uses the registry as is.
 */
export function simpleViewRegistry(registry: ComponentSpecRegistry): ComponentSpecRegistry {
  return Object.fromEntries(Object.entries(registry).filter(([, spec]) => isSimpleViewComponent(spec)))
}

/** A value the inspector treats as "not set": absent, null or an empty string. */
function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/** Structural equality good enough for field values: primitives by `===`, JSON shapes by content. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Whether a field holds a value the user would lose sight of in Simple
 * view: set, and different from what the descriptor would fill in anyway.
 */
export function isSetOffDefault(field: Pick<FieldDescriptor, 'default'>, value: unknown): boolean {
  if (isUnset(value)) return false
  return !sameValue(value, field.default)
}

/**
 * How many settings of ONE component Simple view hides (rule 4): the whole
 * component counts once when it is not a Simple-view component; otherwise
 * every hidden field that is set off its default counts once.
 */
export function hiddenSettingsInComponent(spec: ComponentSpec, data: ComponentData): number {
  if (!isSimpleViewComponent(spec)) return 1
  return hiddenFields(spec).filter((field) => isSetOffDefault(field, data[field.key])).length
}

/**
 * How many settings of a definition Simple view hides — the `N` of "Show
 * N more settings". A component whose type is not in `registry` (unknown,
 * or dormant because its game system is off) contributes nothing: neither
 * tier renders it, so no tier switch could reveal it — that is
 * validation's report, not this row's. `excludedTypes` are components a
 * host edits through a friendlier surface of its own (the Characters
 * page's appearance + speed rows) and therefore never hides.
 */
export function hiddenSettingsCount(
  def: Pick<EntityDefinition, 'components'>,
  registry: ComponentSpecRegistry,
  excludedTypes: readonly string[] = [],
): number {
  let count = 0
  for (const component of def.components) {
    if (excludedTypes.includes(component.type)) continue
    const spec = registry[component.type]
    if (spec) count += hiddenSettingsInComponent(spec, component)
  }
  return count
}

/**
 * Whether a definition carries content Simple view cannot show at all: a
 * component Simple hides, or a `states[]` overlay (no tier has a states
 * editor yet, and the Only-when row is a follow-up). This is what the
 * per-project honesty banner is derived from.
 */
export function definitionHasSimpleViewHiddenContent(
  def: Pick<EntityDefinition, 'components' | 'states'>,
  registry: ComponentSpecRegistry,
): boolean {
  if ((def.states?.length ?? 0) > 0) return true
  return def.components.some((component) => {
    const spec = registry[component.type]
    return spec !== undefined && !isSimpleViewComponent(spec)
  })
}

/**
 * Whether a project contains content Simple view hides anywhere: in the
 * entity library, in an inline placement, or in a placement's component
 * overrides. `maps` are whichever maps the caller has loaded — the scan is
 * honest about what it was shown, no more.
 */
export function projectHasSimpleViewHiddenContent(
  project: Pick<GameProjectData, 'entityLibrary'> | null | undefined,
  maps: readonly Pick<MapData, 'objectPlacements'>[],
  registry: ComponentSpecRegistry,
): boolean {
  const inLibrary = (project?.entityLibrary ?? []).some((def) => definitionHasSimpleViewHiddenContent(def, registry))
  if (inLibrary) return true
  return maps.some((map) =>
    (map.objectPlacements ?? []).some((placement) => {
      if (placement.inline && definitionHasSimpleViewHiddenContent(placement.inline, registry)) return true
      const overrides = placement.overrides?.components
      return overrides !== undefined && definitionHasSimpleViewHiddenContent({ components: overrides }, registry)
    }),
  )
}
