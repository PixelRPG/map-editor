import { Component } from 'excalibur'

/**
 * Tile-grid position of an entity. Pure data — pixel-space transform
 * is derived from `tileX * mapTileWidth` at render time by whatever
 * system consumes this (typically the spawn / sprite-rendering pipe).
 *
 * `layerId` is for sort + visibility grouping only. The layer doesn't
 * own the entity; it just describes which {@link LayerData.id} the
 * placement was bucketed under in the source map JSON.
 */
export class TileTransformComponent extends Component {
  constructor(
    public tileX: number,
    public tileY: number,
    public layerId: string,
  ) {
    super()
  }
}
