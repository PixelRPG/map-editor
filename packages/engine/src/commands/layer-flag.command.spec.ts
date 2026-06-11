/**
 * Apply/revert behaviour of `SetLayerVisibilityCommand` /
 * `SetLayerLockedCommand` plus the wire round-trip through
 * `BUILT_IN_COMMANDS`.
 *
 * Why these exist: `layer.visible` / `layer.locked` are PERSISTED
 * `MapData` state (serialised into the shared map JSON) but used to
 * be mutated by direct field writes in `Engine.setLayerVisible` /
 * `setLayerLocked` — no Command, no undo, no collab sync. A peer's
 * toggle changed only its own MapData + disk, and the other peer's
 * next map save silently overwrote it (the exact "works solo,
 * silently desyncs" trap AGENTS.md's transport-ready rule 2 names).
 * These specs pin the Command path: the flag mutates `MapData`, the
 * visibility apply refreshes what renders from the layer, revert
 * restores the captured previous value, and a serialised payload
 * reconstructs + applies identically on a remote peer.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Actor, TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileTransformComponent } from '../components/tile-transform.component.ts'
import { TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import type { LayerData, LayerTier } from '../types/data/index.ts'
import { SetLayerLockedCommand, SetLayerVisibilityCommand } from './layer-flag.command.ts'
import { BUILT_IN_COMMANDS } from './registry.ts'

interface LayerFixture {
  scene: MapScene
  ground: TileMap
  hero: TileMap
  layers: LayerData[]
  placement: Actor
}

/**
 * Duck-typed `MapScene` (via `Object.create` so `instanceof MapScene`
 * holds without the constructor's engine wiring — same recipe as the
 * paint-tile spec) with two tier tilemaps, two layers, and one
 * placement actor bucketed on the hero layer so the visibility
 * command's placement-flip branch is exercised.
 */
function makeLayerScene(): LayerFixture {
  const layers: LayerData[] = [
    { id: 'ground-layer', name: 'Ground', visible: true, tier: 'ground' } as LayerData,
    { id: 'hero-layer', name: 'Decor', visible: true, locked: false, tier: 'hero' } as LayerData,
  ]
  const spriteSet = { sprites: {}, animations: {} }
  const mapResource = {
    mapData: {
      layers,
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
    },
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([['terrain', spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the commands exercise
  } as any as MapResource

  const makeTierTileMap = (tier: LayerTier): TileMap => {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 2, rows: 2 })
    tileMap.addComponent(new TileMapTierComponent(tier))
    tileMap.addComponent(new MapEditorComponent())
    return tileMap
  }
  const ground = makeTierTileMap('ground')
  const hero = makeTierTileMap('hero')

  const placement = new Actor()
  placement.addComponent(new TileTransformComponent(1, 1, 'hero-layer'))
  placement.graphics.visible = true

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    world: { entityManager: { entities: [ground, hero, placement] } },
  })
  return { scene, ground, hero, layers, placement }
}

function layerOf(fixture: LayerFixture, id: string): LayerData {
  const layer = fixture.layers.find((l) => l.id === id)
  if (!layer) throw new Error(`fixture lost layer ${id}`)
  return layer
}

/** Same console.warn shim as the paint-tile spec — @gjsify/unit has no spy. */
async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('SetLayerVisibilityCommand — apply / revert', async () => {
    await it('apply writes the flag onto MapData and hides the layer placements', async () => {
      const fixture = makeLayerScene()
      const command = new SetLayerVisibilityCommand({ layerId: 'hero-layer', visible: false, previousVisible: true })
      command.apply(fixture.scene)

      expect(layerOf(fixture, 'hero-layer').visible).toBe(false)
      // The placement actor on the hidden layer stops rendering too.
      expect(fixture.placement.graphics.visible).toBe(false)
      // Untouched layer keeps its flag.
      expect(layerOf(fixture, 'ground-layer').visible).toBe(true)
    })

    await it('revert restores the captured previous value (hide → undo round-trip)', async () => {
      const fixture = makeLayerScene()
      const command = new SetLayerVisibilityCommand({ layerId: 'hero-layer', visible: false, previousVisible: true })
      command.apply(fixture.scene)
      expect(layerOf(fixture, 'hero-layer').visible).toBe(false)

      command.revert(fixture.scene)

      expect(layerOf(fixture, 'hero-layer').visible).toBe(true)
      expect(fixture.placement.graphics.visible).toBe(true)
    })

    await it('warns + no-ops for an unknown layer id', async () => {
      const fixture = makeLayerScene()
      const command = new SetLayerVisibilityCommand({ layerId: 'deleted-layer', visible: false, previousVisible: true })
      await muteWarn(() => command.apply(fixture.scene))

      expect(layerOf(fixture, 'ground-layer').visible).toBe(true)
      expect(layerOf(fixture, 'hero-layer').visible).toBe(true)
      expect(fixture.placement.graphics.visible).toBe(true)
    })
  })

  await describe('SetLayerLockedCommand — apply / revert', async () => {
    await it('apply writes the lock flag; revert restores the previous value', async () => {
      const fixture = makeLayerScene()
      const command = new SetLayerLockedCommand({ layerId: 'hero-layer', locked: true, previousLocked: false })

      command.apply(fixture.scene)
      expect(layerOf(fixture, 'hero-layer').locked).toBe(true)

      command.revert(fixture.scene)
      expect(layerOf(fixture, 'hero-layer').locked).toBe(false)
    })

    await it('lock does not touch rendering state', async () => {
      const fixture = makeLayerScene()
      new SetLayerLockedCommand({ layerId: 'hero-layer', locked: true, previousLocked: false }).apply(fixture.scene)

      expect(layerOf(fixture, 'hero-layer').visible).toBe(true)
      expect(fixture.placement.graphics.visible).toBe(true)
    })
  })

  await describe('registry round-trip — serialise → reconstruct → apply', async () => {
    await it('a JSON-roundtripped visibility op reconstructs and applies on a "remote" scene', async () => {
      const local = new SetLayerVisibilityCommand({ layerId: 'hero-layer', visible: false, previousVisible: true })
      // Simulate the wire: payload through JSON, kind through the registry.
      const wirePayload = JSON.parse(JSON.stringify(local.payload))
      const factory = BUILT_IN_COMMANDS[SetLayerVisibilityCommand.KIND]
      expect(factory).toBeDefined()
      const remote = factory!(wirePayload)
      expect(remote).toBeInstanceOf(SetLayerVisibilityCommand)
      expect(remote.kind).toBe('layer.set-visibility')

      const fixture = makeLayerScene()
      remote.apply(fixture.scene)
      expect(layerOf(fixture, 'hero-layer').visible).toBe(false)
      // And the remote revert path (peer undo) restores the captured value.
      remote.revert(fixture.scene)
      expect(layerOf(fixture, 'hero-layer').visible).toBe(true)
    })

    await it('a JSON-roundtripped lock op reconstructs and applies on a "remote" scene', async () => {
      const local = new SetLayerLockedCommand({ layerId: 'ground-layer', locked: true, previousLocked: false })
      const wirePayload = JSON.parse(JSON.stringify(local.payload))
      const factory = BUILT_IN_COMMANDS[SetLayerLockedCommand.KIND]
      expect(factory).toBeDefined()
      const remote = factory!(wirePayload)
      expect(remote).toBeInstanceOf(SetLayerLockedCommand)
      expect(remote.kind).toBe('layer.set-locked')

      const fixture = makeLayerScene()
      remote.apply(fixture.scene)
      expect(layerOf(fixture, 'ground-layer').locked).toBe(true)
      remote.revert(fixture.scene)
      expect(layerOf(fixture, 'ground-layer').locked).toBe(false)
    })
  })
}
