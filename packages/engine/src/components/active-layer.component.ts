import { Component } from 'excalibur'

/**
 * Currently selected layer for tile painting. The layer id matches
 * a `LayerData.id` on the active map. `null` means "no layer
 * selected" — most editor systems fall back to the map's first
 * layer in that case.
 *
 * Lives on the session-singleton; see
 * `docs/concepts/editor-architecture.md`.
 */
export class ActiveLayerComponent extends Component {
  constructor(public layerId: string) {
    super()
  }
}
