import { Component } from 'excalibur'

export interface TileSpriteRef {
  spriteSetId: string
  spriteId: number
  animationId?: string
  zIndex?: number
  layerId: string
}

/**
 * Per-tilemap editor shadow state. Holds the active list of sprite
 * references on each tile so the editor can read + mutate without
 * round-tripping through `mapData.layers[].sprites[]` (which is the
 * JSON-backed source of truth and gets synced on save, not on every
 * paint).
 *
 * Pure data per AGENTS.md ECS doctrine: `sprites` is a flat
 * JSON-serializable `Record` keyed by `"tileX,tileY"`. Read / write
 * verbs live in `services/map-editor-shadow.service.ts` as free
 * functions (`getSpritesAt`, `setSpritesAt`, `setInitialSprites`,
 * `iterateOccupiedCoords`). Callers pass `(tileX, tileY)` numeric
 * coords rather than runtime `ex.Tile` objects, decoupling the
 * shadow state from Excalibur's entity graph.
 */
export class MapEditorComponent extends Component {
  public sprites: Record<string, TileSpriteRef[]> = {}
}
