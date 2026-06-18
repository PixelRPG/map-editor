import { describe, expect, it } from '@gjsify/unit'
import { type Camera, TileMap, Vector } from 'excalibur'

import type { MapScene } from '../scenes/map.scene.ts'
import type { AwarenessMessage } from '../sync/index.ts'
import { ASSISTANT_PEER_ID, AssistantPresenceController } from './assistant-presence.ts'

/** A real TileMap (anyTileMap uses `instanceof TileMap`) at the origin, 16px tiles. */
function makeTileMap(): TileMap {
  return new TileMap({ name: 'm', tileWidth: 16, tileHeight: 16, columns: 4, rows: 4, pos: new Vector(0, 0) })
}

interface Harness {
  controller: AssistantPresenceController
  camera: { pos: Vector }
  added: unknown[]
  relayed: AwarenessMessage[]
  rendererCreated: number
  rendererClosed: number
  setScene(scene: MapScene | null): void
}

function makeHarness(): Harness {
  const tm = makeTileMap()
  const added: unknown[] = []
  let scene: MapScene | null = {
    mapResource: { mapData: { id: 'm' } },
    world: { entityManager: { entities: [tm] } },
    add: (actor: unknown) => added.push(actor),
  } as unknown as MapScene
  const camera = { pos: new Vector(0, 0) }
  const relayed: AwarenessMessage[] = []
  let rendererCreated = 0
  let rendererClosed = 0

  const controller = new AssistantPresenceController({
    host: {
      getActiveScene: () => scene,
      getCamera: () => camera as unknown as Camera,
    },
    createRenderer: () => {
      rendererCreated++
      return {
        close: () => {
          rendererClosed++
        },
      }
    },
  })
  controller.setFrameRelay((m) => relayed.push(m))

  return {
    controller,
    camera,
    added,
    relayed,
    get rendererCreated() {
      return rendererCreated
    },
    get rendererClosed() {
      return rendererClosed
    },
    setScene: (s) => {
      scene = s
    },
  }
}

export default async () => {
  await describe('AssistantPresenceController', async () => {
    await it('setCursor relays presence + cursor at the tile world-centre and goes active', async () => {
      const h = makeHarness()
      expect(h.controller.setCursor(1, 1)).toBe(true)
      expect(h.controller.isActive()).toBe(true)

      const cursor = h.relayed.find((m) => m.type === 'cursor')
      expect(cursor?.type).toBe('cursor')
      if (cursor?.type === 'cursor') {
        // tile (1,1) on a 16px map at origin → centre (24, 24).
        expect(cursor.cursor.x).toBe(24)
        expect(cursor.cursor.y).toBe(24)
        expect(cursor.peerId).toBe(ASSISTANT_PEER_ID)
        expect(cursor.cursor.sceneId).toBe('m')
      }
      expect(h.relayed.some((m) => m.type === 'presence')).toBe(true)
      // The renderer is built lazily, exactly once.
      expect(h.rendererCreated).toBe(1)
    })

    await it('setCursor is a no-op while paused', async () => {
      const h = makeHarness()
      h.controller.setPaused(true)
      expect(h.controller.isPaused()).toBe(true)
      expect(h.controller.setCursor(1, 1)).toBe(false)
      expect(h.relayed).toHaveLength(0)
      expect(h.controller.isActive()).toBe(false)
    })

    await it('setCursor returns false when no scene is active', async () => {
      const h = makeHarness()
      h.setScene(null)
      expect(h.controller.setCursor(0, 0)).toBe(false)
      expect(h.rendererCreated).toBe(0)
    })

    await it('setInfo announces a presence frame in the new colour', async () => {
      const h = makeHarness()
      h.controller.setInfo('Helper', '#ff0000')
      const presence = h.relayed.find((m) => m.type === 'presence')
      expect(presence?.type).toBe('presence')
      if (presence?.type === 'presence') {
        expect(presence.info.displayName).toBe('Helper')
        expect(presence.info.color).toBe('#ff0000')
      }
      expect(h.controller.isActive()).toBe(true)
    })

    await it('hide relays a leave frame and clears active', async () => {
      const h = makeHarness()
      h.controller.setCursor(0, 0)
      h.controller.hide()
      expect(h.controller.isActive()).toBe(false)
      expect(h.relayed.some((m) => m.type === 'leave' && m.peerId === ASSISTANT_PEER_ID)).toBe(true)
    })

    await it('follow eases the camera toward the assistant cursor', async () => {
      const h = makeHarness()
      h.controller.setFollow(true)
      h.controller.setCursor(1, 1) // pans toward world (24, 24)

      h.controller.tickCameraFollow(60) // factor 0.5 → halfway
      expect(h.camera.pos.x).toBe(12)
      expect(h.camera.pos.y).toBe(12)

      // A long-enough tick snaps to the target (within sub-pixel).
      h.controller.tickCameraFollow(1_000)
      expect(h.camera.pos.x).toBe(24)
      expect(h.camera.pos.y).toBe(24)
    })

    await it('tickCameraFollow is a no-op without a target', async () => {
      const h = makeHarness()
      h.controller.tickCameraFollow(16)
      expect(h.camera.pos.x).toBe(0)
      expect(h.camera.pos.y).toBe(0)
    })

    await it('dispose closes the renderer', async () => {
      const h = makeHarness()
      h.controller.setCursor(0, 0) // builds the renderer
      expect(h.rendererCreated).toBe(1)
      h.controller.dispose()
      expect(h.rendererClosed).toBe(1)
    })
  })
}
