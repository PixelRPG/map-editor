/**
 * Region indexing and the region-scoped tile colliders.
 *
 * The pure half (indexing, masks) needs no engine. The integration half
 * drives a real Scene and checks the property that matters: a hero never
 * passes a wall, including one that sits exactly on a region edge.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Actor, CollisionSystem, CollisionType, CompositeCollider, MotionSystem, Scene, vec } from 'excalibur'

import { MapResource } from '../resource/MapResource.ts'
import { PlaneTileMap } from '../resource/plane-tile-map.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { CollisionRegionSystem } from '../systems/collision-region.system.ts'
import {
  COLLISION_REGION_TILES as R,
  createRegionGrid,
  markRegionsAround,
  regionIndexOfTile,
} from './collision-regions.ts'
import { applyRuntimeMode } from './runtime-mode.ts'

const TILE = 16
const SET = 'tiles'
const COLUMNS = 3 * R
/** The first column of the second region: a wall exactly on the border. */
const BORDER_WALL_X = R

function makeScene(wallX: number): { scene: Scene; tileMap: PlaneTileMap } {
  const spriteSet = {
    data: {
      id: SET,
      sprites: [
        { id: 1, solid: false },
        { id: 2, solid: true },
      ],
    },
    sprites: {},
    animations: {},
  } as unknown as SpriteSetResource
  const mapResource = new MapResource('maps/long.json', { headless: true })
  const internals = mapResource as unknown as {
    _mapData: unknown
    spriteSetResources: Map<string, SpriteSetResource>
  }
  internals.spriteSetResources = new Map([[SET, spriteSet]])
  const sprites = []
  for (let x = 0; x < COLUMNS; x++) sprites.push({ x, y: 1, spriteSetId: SET, spriteId: x === wallX ? 2 : 1 })
  internals._mapData = {
    id: 'long',
    name: 'long',
    columns: COLUMNS,
    rows: 3,
    tileWidth: TILE,
    tileHeight: TILE,
    spriteSets: [{ id: SET, path: 'spritesets/tiles.json' }],
    objectPlacements: [],
    layers: [{ id: 'ground', name: 'Ground', visible: true, plane: 'ground', sprites }],
  }
  const scene = new Scene()
  scene.world.add(new CollisionRegionSystem())
  for (const system of steppedSystems(scene)) system.onInitialize?.(scene.world, scene)
  mapResource.addToScene(scene)
  const tileMap = mapResource.getTileMapForPlane('ground')
  if (!(tileMap instanceof PlaneTileMap)) throw new Error('fixture: ground plane is not a PlaneTileMap')
  applyRuntimeMode(scene, true)
  return { scene, tileMap }
}

function steppedSystems(scene: Scene): (CollisionRegionSystem | CollisionSystem | MotionSystem)[] {
  return scene.world.systemManager.systems.filter(
    (system): system is CollisionRegionSystem | CollisionSystem | MotionSystem =>
      system instanceof CollisionRegionSystem || system instanceof CollisionSystem || system instanceof MotionSystem,
  )
}

function tick(scene: Scene, frames: number, ms = 16): void {
  const systems = steppedSystems(scene)
  for (let i = 0; i < frames; i++) {
    scene.world.entityManager.updateEntities(scene, ms)
    for (const system of systems) system.onUpdate(ms)
  }
}

function boxCount(tileMap: PlaneTileMap): number {
  const collider = tileMap.collider.get()
  return collider instanceof CompositeCollider ? collider.getColliders().length : 0
}

function hero(scene: Scene, tileX: number, speed: number): Actor {
  const actor = new Actor({
    x: (tileX + 0.5) * TILE,
    y: 1.5 * TILE,
    width: 8,
    height: 8,
    collisionType: CollisionType.Active,
  })
  actor.vel = vec(speed, 0)
  scene.add(actor)
  return actor
}

export default async () => {
  await describe('collision regions: indexing', async () => {
    const grid = createRegionGrid(COLUMNS, 3)

    await it('cuts the map into square regions, rounding up', async () => {
      expect(grid.regionColumns).toBe(3)
      expect(grid.regionRows).toBe(1)
      expect(createRegionGrid(R + 1, R + 1).count).toBe(4)
    })

    await it('indexes tiles, with the border tile in the later region', async () => {
      expect(regionIndexOfTile(grid, 0, 0)).toBe(0)
      expect(regionIndexOfTile(grid, R - 1, 2)).toBe(0)
      expect(regionIndexOfTile(grid, R, 0)).toBe(1)
      expect(regionIndexOfTile(grid, COLUMNS - 1, 0)).toBe(2)
      expect(regionIndexOfTile(grid, -1, 0)).toBe(-1)
      expect(regionIndexOfTile(grid, COLUMNS, 0)).toBe(-1)
    })

    await it('marks only the regions a body can reach', async () => {
      const mask = new Uint8Array(grid.count)
      markRegionsAround(grid, mask, R / 2, 1, 4, 4)
      expect(Array.from(mask).join()).toBe('1,0,0')
    })

    await it('marks both sides when a body is within the margin of a border', async () => {
      const mask = new Uint8Array(grid.count)
      markRegionsAround(grid, mask, R - 1, 1, 4, 4)
      expect(Array.from(mask).join()).toBe('1,1,0')
    })

    await it('keeps the edge regions for a body off the map', async () => {
      const mask = new Uint8Array(grid.count)
      markRegionsAround(grid, mask, -50, 1, 2, 2)
      expect(Array.from(mask).join()).toBe('1,0,0')
    })
  })

  await describe('collision regions: tile colliders', async () => {
    await it('builds boxes only near the hero, not for the whole map', async () => {
      const { scene, tileMap } = makeScene(2 * R + 5)
      hero(scene, 2, 0)
      tick(scene, 2)
      expect(boxCount(tileMap)).toBe(0)
      expect(tileMap.regions.active[2]).toBe(0)
    })

    await it('swaps regions when the hero crosses into a new one', async () => {
      const { scene, tileMap } = makeScene(2 * R + 5)
      const actor = hero(scene, R - 2, 0)
      tick(scene, 1)
      expect(tileMap.regions.active[1]).toBe(1)
      actor.pos = vec((2 * R + 4) * TILE, 1.5 * TILE)
      tick(scene, 2)
      expect(tileMap.regions.active[2]).toBe(1)
      expect(tileMap.regions.active[0]).toBe(0)
      expect(boxCount(tileMap)).toBe(1)
    })

    await it('stops a hero at a wall exactly on a region border', async () => {
      const { scene } = makeScene(BORDER_WALL_X)
      const actor = hero(scene, R - 6, 90)
      tick(scene, 240)
      expect(actor.pos.x + 4 <= BORDER_WALL_X * TILE + 0.5).toBe(true)
    })

    await it('stops a fast hero at the border wall on normal frames', async () => {
      const { scene } = makeScene(BORDER_WALL_X)
      // 600 px/s is ~10 px per 16 ms step: faster than any hero, still
      // inside what Excalibur's own solver resolves against a 16 px wall.
      const actor = hero(scene, R - 6, 600)
      tick(scene, 60)
      expect(actor.pos.x + 4 <= BORDER_WALL_X * TILE + 0.5).toBe(true)
    })
  })
}
