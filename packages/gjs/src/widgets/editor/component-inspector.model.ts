import type { ComponentData } from '@pixelrpg/engine'

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
