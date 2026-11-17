/**
 * Collision exists only while a run is active.
 *
 * Driven through a real Excalibur `Scene` (physics world, collision
 * system, motion) and a real headless `MapResource`, so "the hero
 * cannot walk through walls" is observed, not inferred from a flag.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Actor, CollisionSystem, CollisionType, CompositeCollider, MotionSystem, Scene, vec } from 'excalibur'

import { MapEditorComponent } from '../components/index.ts'
import { MapResource } from '../resource/MapResource.ts'
import { PlaneTileMap } from '../resource/plane-tile-map.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { isCollisionActive, setCollisionActive } from './collision-mode.ts'
import { applyRuntimeMode } from './runtime-mode.ts'

const TILE = 16
const SET = 'tiles'
const FREE = 1
const WALL = 2

/** A 6 × 3 ground row: a wall at x = 3, free floor elsewhere. */
function makeScene(): { scene: Scene; mapResource: MapResource } {
  const spriteSet = {
    data: {
      id: SET,
      sprites: [
        { id: FREE, solid: false },
        { id: WALL, solid: true },
      ],
    },
    sprites: {},
    animations: {},
  } as unknown as SpriteSetResource
  const mapResource = new MapResource('maps/corridor.json', { headless: true })
  const internals = mapResource as unknown as {
    _mapData: unknown
    spriteSetResources: Map<string, SpriteSetResource>
  }
  internals.spriteSetResources = new Map([[SET, spriteSet]])
  const sprites = []
  for (let x = 0; x < 6; x++) sprites.push({ x, y: 1, spriteSetId: SET, spriteId: x === 3 ? WALL : FREE })
  internals._mapData = {
    id: 'corridor',
    name: 'corridor',
    columns: 6,
    rows: 3,
    tileWidth: TILE,
    tileHeight: TILE,
    spriteSets: [{ id: SET, path: 'spritesets/tiles.json' }],
    objectPlacements: [],
    layers: [{ id: 'ground', name: 'Ground', visible: true, plane: 'ground', sprites }],
  }
  const scene = new Scene()
  // No engine here, so only the systems this suite is about are initialized
  // and stepped; the others need a screen.
  for (const system of physicsSystems(scene)) system.onInitialize?.(scene.world, scene)
  mapResource.addToScene(scene)
  setCollisionActive(scene, false)
  return { scene, mapResource }
}

function physicsSystems(scene: Scene): (CollisionSystem | MotionSystem)[] {
  return scene.world.systemManager.systems.filter(
    (system): system is CollisionSystem | MotionSystem =>
      system instanceof CollisionSystem || system instanceof MotionSystem,
  )
}

/** Entities first, then motion and collision, the order `World.update` uses. */
function tick(scene: Scene, frames = 1): void {
  const systems = physicsSystems(scene)
  for (let i = 0; i < frames; i++) {
    scene.world.entityManager.updateEntities(scene, 16)
    for (const system of systems) system.onUpdate(16)
  }
}

/** Boxes the collision processor currently tracks across the whole scene. */
function trackedColliders(scene: Scene): number {
  return scene.physics.collisionProcessor.getColliders().length
}

function builtTileBoxes(tileMap: PlaneTileMap): number {
  const collider = tileMap.collider.get()
  return collider instanceof CompositeCollider ? collider.getColliders().length : 0
}

function groundTileMap(mapResource: MapResource): PlaneTileMap {
  const tileMap = mapResource.getTileMapForPlane('ground')
  if (!(tileMap instanceof PlaneTileMap)) throw new Error('fixture: ground plane is not a PlaneTileMap')
  return tileMap
}

/** A hero in the corridor, pushing right at the wall. Returns it after `frames` ticks. */
function walkIntoWall(scene: Scene, frames: number): Actor {
  const hero = new Actor({
    x: 1.5 * TILE,
    y: 1.5 * TILE,
    width: 8,
    height: 8,
    collisionType: CollisionType.Active,
  })
  hero.vel = vec(60, 0)
  scene.add(hero)
  tick(scene, frames)
  return hero
}

export default async () => {
  await describe('collision follows the run', async () => {
    await it('builds no tile collision while idle in the editor', async () => {
      const { scene, mapResource } = makeScene()
      tick(scene, 3)
      expect(isCollisionActive(scene)).toBe(false)
      expect(trackedColliders(scene)).toBe(0)
      expect(builtTileBoxes(groundTileMap(mapResource))).toBe(0)
    })

    await it('keeps the tile data that wall hatching reads while no collider exists', async () => {
      const { scene, mapResource } = makeScene()
      tick(scene, 2)
      const editor = groundTileMap(mapResource).get(MapEditorComponent)
      if (!editor) throw new Error('fixture: ground plane has no editor shadow')
      expect(mapResource.collisionAt(editor, 3, 1).solid).toBe(true)
      expect(mapResource.collisionAt(editor, 2, 1).solid).toBe(false)
      expect(trackedColliders(scene)).toBe(0)
    })

    await it('paints and refreshes solidity without building colliders', async () => {
      const { scene, mapResource } = makeScene()
      tick(scene)
      const tileMap = groundTileMap(mapResource)
      const tile = tileMap.getTile(1, 1)
      if (!tile) throw new Error('fixture: tile missing')
      tile.isSolid = true
      tick(scene, 2)
      expect(trackedColliders(scene)).toBe(0)
    })

    await it('lets the hero walk through the wall in the editor', async () => {
      const { scene } = makeScene()
      const hero = walkIntoWall(scene, 60)
      expect(hero.pos.x > 3.5 * TILE).toBe(true)
    })

    await it('stops the hero at the wall once a run starts', async () => {
      const { scene } = makeScene()
      applyRuntimeMode(scene, true)
      expect(isCollisionActive(scene)).toBe(true)
      const hero = walkIntoWall(scene, 60)
      expect(trackedColliders(scene) > 0).toBe(true)
      // The wall's left edge is x = 3 * TILE; the hero's right edge may not pass it.
      expect(hero.pos.x + 4 <= 3 * TILE + 0.5).toBe(true)
    })

    await it('picks up a wall painted while the run is active', async () => {
      const { scene, mapResource } = makeScene()
      applyRuntimeMode(scene, true)
      tick(scene)
      const tile = groundTileMap(mapResource).getTile(2, 1)
      if (!tile) throw new Error('fixture: tile missing')
      tile.isSolid = true
      const hero = walkIntoWall(scene, 60)
      expect(hero.pos.x + 4 <= 2 * TILE + 0.5).toBe(true)
    })

    await it('returns to the cheap state when the run ends', async () => {
      const { scene, mapResource } = makeScene()
      applyRuntimeMode(scene, true)
      tick(scene, 2)
      expect(trackedColliders(scene) > 0).toBe(true)
      expect(builtTileBoxes(groundTileMap(mapResource)) > 0).toBe(true)
      applyRuntimeMode(scene, false)
      tick(scene, 2)
      expect(isCollisionActive(scene)).toBe(false)
      expect(trackedColliders(scene)).toBe(0)
      expect(groundTileMap(mapResource).collisionActive).toBe(false)
      expect(builtTileBoxes(groundTileMap(mapResource))).toBe(0)
    })

    await it('builds correct walls again on a second run', async () => {
      const { scene } = makeScene()
      applyRuntimeMode(scene, true)
      tick(scene, 2)
      applyRuntimeMode(scene, false)
      tick(scene, 2)
      applyRuntimeMode(scene, true)
      const hero = walkIntoWall(scene, 60)
      expect(hero.pos.x + 4 <= 3 * TILE + 0.5).toBe(true)
    })

    await it('is idempotent', async () => {
      const { scene } = makeScene()
      applyRuntimeMode(scene, true)
      applyRuntimeMode(scene, true)
      tick(scene, 2)
      const first = trackedColliders(scene)
      applyRuntimeMode(scene, true)
      tick(scene, 2)
      expect(trackedColliders(scene)).toBe(first)
    })
  })
}
