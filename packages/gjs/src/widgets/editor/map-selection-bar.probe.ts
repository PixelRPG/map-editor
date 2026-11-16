import Adw from '@girs/adw-1'

import { MapSelectionBar } from './map-selection-bar.ts'
import type { MapSelectionFacts } from './map-summary.model.ts'

/**
 * The selection bar read back through the widgets its template binds,
 * rather than through the getters behind them.
 *
 * The defect this exists for: Blueprint's `bind` is sync-create, so
 * every bound property is read from inside `super()` — before the class
 * fields are initialised. `revealed` saw `this._facts === undefined`,
 * answered `undefined !== null`, and the binding pushed `visible: true`
 * onto the bar box for good: the atlas opened with an empty pill and a
 * dead "Open" button. A getter test cannot see this, because by the
 * time a spec can call the getter the fields are in place — only the
 * bound widget still carries the answer from construction time.
 *
 * GTK-only; the spec loads this lazily.
 */

/** What the template's `bind`s put on the widgets, plus the getters for comparison. */
export interface SelectionBarState {
  /** `bar_box.visible` — `bind template.revealed`, as the binding left it. */
  barVisible: boolean
  revealed: boolean
  name: string
  details: string
}

function stateOf(bar: MapSelectionBar): SelectionBarState {
  return {
    barVisible: bar._bar_box.visible,
    revealed: bar.revealed,
    name: bar.mapName,
    details: bar.mapDetails,
  }
}

/** The bar as built, with a map set, and after the map is taken away again. */
export function probeSelectionBar(
  name: string,
  facts: MapSelectionFacts,
): { fresh: SelectionBarState; withMap: SelectionBarState; cleared: SelectionBarState } {
  // The template names libadwaita types, which only `Adw.init()`
  // registers in a bare test process (the app gets it from
  // `Adw.Application`).
  Adw.init()
  const bar = new MapSelectionBar()
  const fresh = stateOf(bar)
  bar.setMap(name, facts)
  const withMap = stateOf(bar)
  bar.setMap(null, null)
  const cleared = stateOf(bar)
  return { fresh, withMap, cleared }
}
