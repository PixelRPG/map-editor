/**
 * "Show walls" on the map, driven through a REAL `MapResource`.
 *
 * The overlay's whole point is that it cannot disagree with the
 * physics, so the fixture loads map data into a headless `MapResource`
 * and lets it build its own plane tilemaps and editor shadows. The
 * collision answers therefore come from `MapResource.collisionAt` —
 * the same fold the collider build uses — rather than from a stub that
 * could quietly answer differently.
 */

import { describe, expect, it } from '@gjsify/unit'
import type { Actor, Entity, Scene } from 'excalibur'

import { EditorViewModeComponent, MapEditorComponent } from '../components/index.ts'
import { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { SessionState } from '../utils/session-state.ts'
import { setSpritesAt } from './map-editor-shadow.service.ts'
import { hatchSegments } from './wall-hatch.ts'
import { refreshWallOverlayFor, wallOverlayLineCount } from './wall-overlay.ts'

const TILE = 16
const GROUND = 'ground'
const CANOPY = 'canopy'
const SET = 'tiles'

const FREE = 1
const WALL = 2
const HALF = 3

interface SpriteDef {
  id: number
  solid?: boolean
  colliders?: Array<{ type: 'rectangle'; width: number; height: number; offset?: { x: number; y: number } }>
}

interface Fixture {
  scene: MapScene
  mapResource: MapResource
  entities: Entity[]
  definitions: SpriteDef[]
  groundEditor: MapEditorComponent
  overlayActor: () => Actor | undefined
}

/** The hatch of one whole tile at cell `(x, y)`, in map pixels. */
function wholeTileLines(x: number, y: number): number {
  return hatchSegments({ x: x * TILE, y: y * TILE, width: TILE, height: TILE }).length
}

/** The hatch of the bottom half of the tile at cell `(x, y)`. */
function bottomHalfLines(x: number, y: number): number {
  return hatchSegments({ x: x * TILE, y: y * TILE + TILE / 2, width: TILE, height: TILE / 2 }).length
}

/**
 * A 4 × 3 map with two layers on two planes.
 *
 * Blocking cells, by construction: (0,0) via the ground wall (the
 * canopy's free sprite above it must not change that), (1,0) via the
 * canopy wall alone (the ground sprite there is free), (2,2) via the
 * ground half-tile collider.
 */
function makeFixture(): Fixture {
  const definitions: SpriteDef[] = [
    { id: FREE, solid: false },
    { id: WALL, solid: true },
    {
      id: HALF,
      solid: true,
      colliders: [{ type: 'rectangle', width: TILE, height: TILE / 2, offset: { x: 0, y: 8 } }],
    },
  ]
  const spriteSet = {
    data: { id: SET, sprites: definitions },
    sprites: {},
    animations: {},
  } as unknown as SpriteSetResource

  const mapResource = new MapResource('maps/walls.json', { headless: true })
  const internals = mapResource as unknown as {
    _mapData: unknown
    spriteSetResources: Map<string, SpriteSetResource>
  }
  internals.spriteSetResources = new Map([[SET, spriteSet]])
  internals._mapData = {
    id: 'walls',
    name: 'walls',
    columns: 4,
    rows: 3,
    tileWidth: TILE,
    tileHeight: TILE,
    spriteSets: [{ id: SET, path: 'spritesets/tiles.json' }],
    objectPlacements: [],
    layers: [
      {
        id: GROUND,
        name: 'Ground',
        visible: true,
        plane: 'ground',
        sprites: [
          { x: 0, y: 0, spriteSetId: SET, spriteId: WALL },
          { x: 1, y: 0, spriteSetId: SET, spriteId: FREE },
          { x: 3, y: 1, spriteSetId: SET, spriteId: FREE },
          { x: 2, y: 2, spriteSetId: SET, spriteId: HALF },
        ],
      },
      {
        id: CANOPY,
        name: 'Canopy',
        visible: true,
        plane: 'overlay',
        sprites: [
          { x: 0, y: 0, spriteSetId: SET, spriteId: FREE },
          { x: 1, y: 0, spriteSetId: SET, spriteId: WALL },
        ],
      },
    ],
  }

  const entities: Entity[] = []
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    entityLibrary: [],
    add(entity: Entity) {
      entities.push(entity)
    },
    world: { entityManager: { entities } },
  })
  mapResource.addToScene(scene as unknown as Scene)

  const groundTileMap = mapResource.getTileMapForPlane('ground')
  const groundEditor = groundTileMap?.get(MapEditorComponent)
  if (!groundEditor) throw new Error('fixture: ground plane has no editor shadow')

  return {
    scene,
    mapResource,
    entities,
    definitions,
    groundEditor,
    overlayActor: () => entities.find((e) => e.name === 'wall-hatch-overlay') as Actor | undefined,
  }
}

function showWalls(f: Fixture, on: boolean): void {
  SessionState.set(f.scene, new EditorViewModeComponent(false, false, true, on))
}

export default async () => {
  await describe('refreshWallOverlayFor', async () => {
    await it('adds no actor at all while the flag is off', async () => {
      const f = makeFixture()
      refreshWallOverlayFor(f.scene)
      expect(f.overlayActor()).toBe(undefined)
      showWalls(f, false)
      refreshWallOverlayFor(f.scene)
      expect(f.overlayActor()).toBe(undefined)
    })

    await it('hatches every blocking cell exactly once, union over planes', async () => {
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      expect(actor.graphics.visible).toBe(true)
      // (0,0) blocks although the canopy sprite above it is free, (1,0)
      // blocks although the ground sprite under the canopy wall is free
      // — and each blocking cell contributes ONE tile's worth of lines,
      // which is what keeps two blocking planes from doubling the alpha.
      const expected = wholeTileLines(0, 0) + wholeTileLines(1, 0) + bottomHalfLines(2, 2)
      expect(wallOverlayLineCount(actor)).toBe(expected)
    })

    await it('positions the overlay on the map and keeps it above the planes', async () => {
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      const groundTileMap = f.mapResource.getTileMapForPlane('ground')
      expect(actor.pos.x).toBe(groundTileMap?.pos.x ?? -1)
      expect(actor.pos.y).toBe(groundTileMap?.pos.y ?? -1)
      expect(actor.z > (groundTileMap?.z ?? 0)).toBe(true)
    })

    await it('hides the overlay when nothing on the map blocks', async () => {
      const f = makeFixture()
      for (const definition of f.definitions) definition.solid = false
      f.mapResource.refreshTileSolidsForSpriteSet(SET)
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      expect(wallOverlayLineCount(actor)).toBe(0)
      expect(actor.graphics.visible).toBe(false)
    })

    await it('hides the overlay again when the flag goes off', async () => {
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      showWalls(f, false)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      expect(actor.graphics.visible).toBe(false)
    })

    await it('reuses the graphic until the map changes', async () => {
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      const first = actor.graphics.current
      refreshWallOverlayFor(f.scene)
      expect(actor.graphics.current).toBe(first)

      // A paint into the shadow bumps the plane's revision.
      setSpritesAt(f.groundEditor, 3, 1, GROUND, [{ spriteSetId: SET, spriteId: WALL }])
      refreshWallOverlayFor(f.scene)
      expect(actor.graphics.current === first).toBe(false)
      const expected = wholeTileLines(0, 0) + wholeTileLines(1, 0) + bottomHalfLines(2, 2) + wholeTileLines(3, 1)
      expect(wallOverlayLineCount(actor)).toBe(expected)
    })

    await it('picks up a tileset collision edit no cell write reflects', async () => {
      // Marking a sprite "Wall" in the tileset changes what every
      // placement of it blocks without touching a single cell, so the
      // shadow's own revision cannot see it — `collisionRevision` must.
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      const before = wallOverlayLineCount(actor)

      const free = f.definitions.find((d) => d.id === FREE)
      if (!free) throw new Error('fixture: no free sprite definition')
      free.solid = true
      f.mapResource.refreshTileSolidsForSprite(SET, FREE)
      refreshWallOverlayFor(f.scene)
      // The two cells that only held free sprites now block as well.
      expect(wallOverlayLineCount(actor)).toBe(before + wholeTileLines(3, 1))
    })

    await it('skips shadow entries outside the map bounds', async () => {
      // A map shrunk after painting keeps the old refs in the shadow
      // until the next save; hatching them would draw outside the grid.
      const f = makeFixture()
      showWalls(f, true)
      refreshWallOverlayFor(f.scene)
      const actor = f.overlayActor()
      if (!actor) throw new Error('overlay actor missing')
      const before = wallOverlayLineCount(actor)
      setSpritesAt(f.groundEditor, 9, 9, GROUND, [{ spriteSetId: SET, spriteId: WALL }])
      refreshWallOverlayFor(f.scene)
      expect(wallOverlayLineCount(actor)).toBe(before)
    })
  })
}
