import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt } from '../services/map-editor-shadow.service.ts'
import { findTileMapForLayer } from '../services/tile-paint.service.ts'
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
      const properties = this.resolveTileProperties(scene, tileX, tileY)
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
   * Source of truth: the LIVE tilemap shadow (`MapEditorComponent`
   * via {@link getSpritesAt}) — the same state tile paints mutate
   * and collision reads — so a tile painted mid-play behaves
   * immediately. `mapData.layers[].sprites` only updates on the
   * persistence fold, so reading it here raced live edits. Layers
   * without a live tilemap (headless contexts) fall back to the
   * mapData snapshot.
   *
   * Hot path: called on every `PLAYER_TILE_CHANGED`; plain reverse
   * `for` loop, no per-step allocations beyond the shadow lookup.
   */
  private resolveTileProperties(scene: Scene, tileX: number, tileY: number): TileProperties {
    const mapData = this.mapResource.mapData
    if (!mapData) return { walkable: true }

    const layers = mapData.layers
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (!layer.visible) continue

      const found = scene instanceof MapScene ? findTileMapForLayer(scene, layer.id) : null
      let ref: { spriteSetId: string; spriteId: number } | undefined
      if (found) {
        const refs = getSpritesAt(found.editor, tileX, tileY, layer.id)
        ref = refs[refs.length - 1]
      } else {
        ref = layer.sprites?.find((s) => s.x === tileX && s.y === tileY)
      }
      if (!ref) continue

      const spriteSet = this.mapResource.getSpriteSetResource(ref.spriteSetId)
      if (!spriteSet) continue
      const def = spriteSet.data?.sprites.find((s) => s.id === ref.spriteId)
      if (def?.tileProperties) return def.tileProperties
    }
    return { walkable: true }
  }
}
