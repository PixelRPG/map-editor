import { describe, expect, it } from '@gjsify/unit'
import type { Vector } from 'excalibur'

import type { MapScene } from '../scenes/map.scene.ts'
import { type PointerSynthesisHost, synthesizePointerMoveAtTile } from './pointer-synthesis.ts'

/** A host whose Excalibur pointer receiver records what it is asked to trigger. */
function makeHost(mapData: Record<string, unknown> | null) {
  const triggered: Array<{ type: string; pos: Vector }> = []
  const host: PointerSynthesisHost = {
    excalibur: {
      input: {
        pointers: {
          triggerEvent: (type: string, pos: Vector) => {
            triggered.push({ type, pos })
          },
        },
      },
    } as unknown as PointerSynthesisHost['excalibur'],
    activeScene: () => (mapData ? ({ mapResource: { mapData } } as unknown as MapScene) : null),
  }
  return { host, triggered }
}

export default async () => {
  await describe('synthesizePointerMoveAtTile', async () => {
    await it('does nothing and reports false without an active map', async () => {
      const { host, triggered } = makeHost(null)
      expect(synthesizePointerMoveAtTile(host, 3, 2)).toBe(false)
      expect(triggered.length).toBe(0)
    })

    await it("triggers a 'move' at the tile's centre in world space", async () => {
      const { host, triggered } = makeHost({ tileWidth: 16, tileHeight: 16 })
      expect(synthesizePointerMoveAtTile(host, 3, 2)).toBe(true)
      expect(triggered.length).toBe(1)
      expect(triggered[0].type).toBe('move')
      expect(triggered[0].pos.x).toBe(56)
      expect(triggered[0].pos.y).toBe(40)
    })

    await it('honours a map origin offset', async () => {
      const { host, triggered } = makeHost({ tileWidth: 16, tileHeight: 16, pos: { x: 10, y: 20 } })
      synthesizePointerMoveAtTile(host, 3, 2)
      expect(triggered[0].pos.x).toBe(66)
      expect(triggered[0].pos.y).toBe(60)
    })

    await it('falls back to the default tile size when the map declares none', async () => {
      const { host, triggered } = makeHost({})
      synthesizePointerMoveAtTile(host, 1, 1)
      expect(triggered[0].pos.x).toBe(24)
      expect(triggered[0].pos.y).toBe(24)
    })
  })
}
