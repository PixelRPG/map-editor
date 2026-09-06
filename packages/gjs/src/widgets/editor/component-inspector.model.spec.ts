import { describe, expect, it } from '@gjsify/unit'
import type { ComponentData } from '@pixelrpg/engine'
import { overlayRenderedFields } from './component-inspector.model.ts'

export default async () => {
  await describe('overlayRenderedFields', async () => {
    await it('keeps every field no row renders (the Simple-view data-loss case)', async () => {
      // A trigger whose `once` + `scriptId` rows are filtered out; only
      // `on` is on screen and gets edited.
      const base: ComponentData = { type: 'trigger', on: 'walk-onto', once: true, scriptId: 'door-check' }
      const out = overlayRenderedFields('trigger', base, [{ key: 'on', value: 'action-button' }])
      expect(out).toStrictEqual({ type: 'trigger', on: 'action-button', once: true, scriptId: 'door-check' })
    })

    await it('overlays every rendered row onto the base', async () => {
      const base: ComponentData = { type: 'teleport', targetMapId: 'a', targetTileX: 1, targetTileY: 2 }
      const out = overlayRenderedFields('teleport', base, [
        { key: 'targetMapId', value: 'b' },
        { key: 'targetTileX', value: 7 },
      ])
      expect(out).toStrictEqual({ type: 'teleport', targetMapId: 'b', targetTileX: 7, targetTileY: 2 })
    })

    await it('removes a key whose rendered row reports undefined (an emptied entry)', async () => {
      const base: ComponentData = { type: 'item', itemId: 'key', pickupSound: 'chime' }
      const out = overlayRenderedFields('item', base, [{ key: 'pickupSound', value: undefined }])
      expect(out).toStrictEqual({ type: 'item', itemId: 'key' })
      expect('pickupSound' in out).toBe(false)
    })

    await it('carries keys the spec does not describe through untouched', async () => {
      // A newer editor may have written a field this build has no
      // descriptor for; editing an unrelated row must not strip it.
      const base: ComponentData = { type: 'visual', spriteSetId: 'hero', futureKey: { nested: [1, 2] } }
      const out = overlayRenderedFields('visual', base, [{ key: 'spriteSetId', value: 'villain' }])
      expect(out.futureKey).toStrictEqual({ nested: [1, 2] })
      expect(out.spriteSetId).toBe('villain')
    })

    await it('builds from the rows alone when no payload was set yet', async () => {
      const out = overlayRenderedFields('movement', null, [{ key: 'tilesPerSec', value: 4 }])
      expect(out).toStrictEqual({ type: 'movement', tilesPerSec: 4 })
    })

    await it('always stamps the type the spec names and never mutates the base', async () => {
      const base: ComponentData = { type: 'stale', foo: 1 }
      const out = overlayRenderedFields('fresh', base, [{ key: 'foo', value: 2 }])
      expect(out.type).toBe('fresh')
      expect(base).toStrictEqual({ type: 'stale', foo: 1 })
    })
  })
}
