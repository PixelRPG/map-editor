import type { ComponentData, ComponentSpec, FieldDescriptor } from '@pixelrpg/engine'

/**
 * Which Adwaita row renders a field — the REDESIGN § 4.4 mapping, named
 * after the decision rather than the widget class so the switch that
 * builds the row has nothing left to decide.
 */
export type RowKind =
  | 'switch'
  | 'spin'
  | 'toggle-group'
  | 'combo'
  | 'entry'
  | 'text'
  | 'text-list'
  | 'reference'
  | 'json'

/**
 * Above this many choices an enum gets an `Adw.ComboRow` instead of an
 * inline `Adw.ToggleGroup`: four segments are the most that still fit the
 * row's suffix at the narrowest (phone) width.
 */
export const TOGGLE_GROUP_MAX_OPTIONS = 4

/** Fallback upper bound for a numeric field whose spec names no `max`. */
export const SPIN_UPPER_DEFAULT = 100000

/**
 * The row kind for one field, given how many choices its options list
 * actually resolved to (the engine can't know a project's maps, so the
 * host counts them).
 *
 * `optionCount` only decides between toggle group and combo; a reference
 * field is a reference row however many targets exist, because its job is
 * to show a thumbnail and open a picker, not to list values inline.
 */
export function rowKindFor(field: FieldDescriptor, optionCount: number): RowKind {
  switch (field.input) {
    case 'bool':
      return 'switch'
    case 'int':
    case 'float':
      return 'spin'
    case 'map-ref':
    case 'appearance-ref':
    case 'sprite-ref':
      return 'reference'
    case 'json':
      return 'json'
    case 'localized-text':
      return 'text'
    case 'localized-text-list':
      return 'text-list'
    case 'select':
    case 'facing':
      return optionCount > 0 && optionCount <= TOGGLE_GROUP_MAX_OPTIONS ? 'toggle-group' : 'combo'
    default:
      return 'entry'
  }
}

/** The `Gtk.Adjustment` + digits a numeric field's `Adw.SpinRow` needs. */
export interface SpinGeometry {
  lower: number
  upper: number
  step: number
  digits: number
}

/** Bounds, step and decimal places for a numeric field. */
export function spinGeometryFor(field: FieldDescriptor): SpinGeometry {
  const isInt = field.input === 'int'
  return {
    lower: field.min ?? 0,
    upper: field.max ?? SPIN_UPPER_DEFAULT,
    step: field.step ?? (isInt ? 1 : 0.5),
    digits: isInt ? 0 : 2,
  }
}

/**
 * What a numeric row should display for `value`, clamped into the field's
 * bounds and rounded for an `int`.
 *
 * An absent or non-numeric value falls back to the field's `default`, NOT
 * to its `min`: a `min: 0, default: 64` speed showed a flat 0 for every
 * entity that had never been edited, which reads as "this entity cannot
 * move" rather than "this field is untouched".
 */
export function spinValueFor(field: FieldDescriptor, value: unknown): number {
  const { lower, upper } = spinGeometryFor(field)
  const fallback = typeof field.default === 'number' ? field.default : lower
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const clamped = Math.min(Math.max(raw, lower), upper)
  return field.input === 'int' ? Math.round(clamped) : clamped
}

/**
 * The data a freshly added component would carry: its `type` plus every
 * field that names a `default`. What the header menu's "Reset" restores.
 *
 * A field without a default is OMITTED rather than nulled out — absent is
 * how the rest of the pipeline spells "never set" (validation reports a
 * missing `required` field, the generated row shows its own fallback), and
 * writing `undefined` into the payload would make it survive
 * JSON round-trips as a key with no value.
 */
export function defaultComponentData(spec: Pick<ComponentSpec, 'type' | 'fields'>): ComponentData {
  const data: ComponentData = { type: spec.type }
  for (const field of spec.fields) {
    if (field.default !== undefined) data[field.key] = field.default
  }
  return data
}

/** One rendered row's current value, keyed by its field. */
export interface RenderedFieldValue {
  key: string
  value: unknown
}

/**
 * Re-assemble a component's data from the last payload the host set
 * (`base`) and the rows that are on screen. GTK-free so the
 * {@link ComponentInspector}'s one piece of data logic is unit-testable.
 *
 * The rows are an OVERLAY, never the whole truth: a row that is not
 * rendered — because a view tier filtered it out — keeps the value the
 * host set, and a key the spec does not describe at all rides through
 * untouched. Rebuilding the data from the rows alone was how a filtered
 * inspector would have dropped every hidden field on the first edit of
 * any other one.
 *
 * A rendered row reporting `undefined` (an emptied text entry, an unset
 * "(None)" reference) removes its key, so clearing a field still clears it.
 */
export function overlayRenderedFields(
  type: string,
  base: ComponentData | null,
  rendered: readonly RenderedFieldValue[],
): ComponentData {
  const data: ComponentData = { ...(base ?? {}), type }
  for (const { key, value } of rendered) {
    if (value === undefined) delete data[key]
    else data[key] = value
  }
  return data
}
