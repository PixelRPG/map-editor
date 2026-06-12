/**
 * `WalkOnTileSystem` — pins the live-shadow resolution contract:
 * tile properties come from the tilemap shadow (`MapEditorComponent`,
 * the state tile paints mutate and collision reads), NOT from the
 * stale `mapData.layers[].sprites` snapshot that only updates on the
 * persistence fold. A tile painted mid-play must change walk events
 * immediately. Layers without a live tilemap fall back to mapData.
 */

import { describe, expect, it } from '@gjsify/unit'
import { EventEmitter, TileMap, type World } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { setSpritesAt } from '../services/map-editor-shadow.service.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { WalkOnTileSystem } from './walk-on-tile.system.ts'

interface WalkFixture {
  scene: MapScene
  events: EventEmitter<EngineEventMap>
  editor: MapEditorComponent
  walkedOnto: Array<{ tileX: number; tileY: number; properties: Record<string, unknown> }>
}

/**
 * Duck-typed `MapScene` (via `Object.create` so `instanceof MapScene`
 * holds) with ONE real ground-tier `TileMap` + shadow. The sprite-set
 * descriptor gives sprite 0 `surface: 'grass'` and sprite 1
 * `surface: 'water'`; mapData's STALE snapshot claims sprite 0 at
 * (1,1) while the live shadow holds sprite 1 — the divergence the
 * resolution contract is about.
 */
function makeWalkScene(): WalkFixture {
  const events = new EventEmitter<EngineEventMap>()
  const spriteSet = {
    data: {
      sprites: [
        { id: 0, tileProperties: { walkable: true, surface: 'grass' } },
        { id: 1, tileProperties: { walkable: true, surface: 'water' } },
      ],
    },
  }
  const mapResource = {
    mapData: {
      layers: [
        {
          id: 'ground-layer',
          name: 'Ground',
          visible: true,
          tier: 'ground',
          // STALE snapshot: claims grass at (1,1).
          sprites: [{ x: 1, y: 1, spriteId: 0, spriteSetId: 'terrain' }],
        },
      ],
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
    },
    getSpriteSetResource: () => spriteSet,
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the system exercises
  } as any as MapResource

  const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
  tileMap.addComponent(new TileMapTierComponent('ground'))
  const editor = new MapEditorComponent()
  tileMap.addComponent(editor)
  // LIVE shadow: water at (1,1) — e.g. painted mid-play.
  setSpritesAt(editor, 1, 1, 'ground-layer', [{ spriteId: 1, spriteSetId: 'terrain' }])

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    world: { entityManager: { entities: [tileMap] } },
  })

  const walkedOnto: WalkFixture['walkedOnto'] = []
  events.on(EngineEvent.WALKED_ONTO_TILE, (payload) => walkedOnto.push(payload))

  const system = new WalkOnTileSystem(mapResource, events)
  system.initialize(undefined as unknown as World, scene)
  return { scene, events, editor, walkedOnto }
}

export default async () => {
  await describe('WalkOnTileSystem — live-shadow tile resolution', async () => {
    await it('resolves from the LIVE shadow, not the stale mapData snapshot', async () => {
      const { events, walkedOnto } = makeWalkScene()
      events.emit(EngineEvent.PLAYER_TILE_CHANGED, { tileX: 1, tileY: 1, previous: null, facing: 'down' })

      expect(walkedOnto.length).toBe(1)
      expect(walkedOnto[0].properties.surface).toBe('water')
    })

    await it('reflects a mid-play shadow edit on the next step', async () => {
      const { events, editor, walkedOnto } = makeWalkScene()
      setSpritesAt(editor, 2, 1, 'ground-layer', [{ spriteId: 0, spriteSetId: 'terrain' }])
      events.emit(EngineEvent.PLAYER_TILE_CHANGED, { tileX: 2, tileY: 1, previous: null, facing: 'right' })

      expect(walkedOnto[0].properties.surface).toBe('grass')
    })

    await it('returns the walkable default for empty tiles', async () => {
      const { events, walkedOnto } = makeWalkScene()
      events.emit(EngineEvent.PLAYER_TILE_CHANGED, { tileX: 3, tileY: 3, previous: null, facing: 'down' })

      expect(walkedOnto[0].properties.walkable).toBe(true)
      expect(walkedOnto[0].properties.surface).toBe(undefined)
    })
  })
}
