import { Component } from 'excalibur'

/**
 * The entity-library definition id the `'object'` tool will stamp onto the
 * map when the user clicks — the "object brush". Lives on the
 * session-singleton entity (see `docs/concepts/editor-architecture.md`),
 * mirroring {@link ActiveTileComponent} for tiles. `null` = no brush
 * chosen yet (a click is a no-op). Set by the host (`win.set-object-brush`
 * → `Engine.setObjectBrush`); read by `TileEditorSystem.applyClick`.
 */
export class ActiveObjectComponent extends Component {
  constructor(public defId: string | null) {
    super()
  }
}
