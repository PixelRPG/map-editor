import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { TileProperties } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Reacts to `player-tile-changed` events by resolving the
 * destination tile's {@link TileProperties} and emitting
 * `walked-onto-tile` with the resolved data.
 *
 * Listeners (audio bus, encounter system, blocker system) get a
 * uniform payload regardless of which sprite-set the tile came
 * from. This is the layer where "water-tiles play splash sounds
 * project-wide" actually works.
 *
 * Resolution path: walk the map's visible layers (top → bottom),
 * find the topmost sprite at `(tileX, tileY)`, look up its
 * `tileProperties` on the matching sprite-set entry. First hit
 * wins. Empty / no-match returns the default `{ walkable: true }`
 * payload.
 */
export class WalkOnTileSystem extends System {
  public readonly systemType = SystemType.Update

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.events.on(EngineEvent.PLAYER_TILE_CHANGED, ({ tileX, tileY }) => {
      const properties = this.resolveTileProperties(tileX, tileY)
      this.events.emit(EngineEvent.WALKED_ONTO_TILE, {
        tileX,
        tileY,
        properties: properties as unknown as Record<string, unknown>,
      })
    })
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription.
  }

  /**
   * Top-down lookup of the tile properties at `(tileX, tileY)`.
   *
   * Iterates layers in reverse (top first) so a foreground tree
   * tile's properties override the ground tile underneath. The
   * first sprite found with `tileProperties` on its sprite-set
   * entry wins; if no layer has a sprite at that coord we return
   * the engine default (walkable, no surface).
   *
   * Hot path: called on every `PLAYER_TILE_CHANGED`. Walks the
   * layers in reverse with a plain `for` loop to avoid the
   * spread + filter + reverse allocation triplet on each step.
   */
  private resolveTileProperties(tileX: number, tileY: number): TileProperties {
    const mapData = this.mapResource.mapData
    if (!mapData) return { walkable: true }

    const layers = mapData.layers
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (!layer.visible) continue
      const sprites = layer.sprites
      if (!sprites) continue
      const sprite = sprites.find((s) => s.x === tileX && s.y === tileY)
      if (!sprite) continue
      const spriteSet = this.mapResource.getSpriteSetResource(sprite.spriteSetId)
      if (!spriteSet) continue
      const def = spriteSet.data?.sprites.find((s) => s.id === sprite.spriteId)
      if (def?.tileProperties) return def.tileProperties
    }
    return { walkable: true }
  }
}
