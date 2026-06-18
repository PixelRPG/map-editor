import { describe, expect, it } from '@gjsify/unit'
import { MapResource } from './MapResource.ts'
import type { SpriteSetResource } from './SpriteSetResource.ts'

export default async () => {
  await describe('MapResource.getSpriteSetResource', async () => {
    await it('falls back to the pre-loaded project-level sets', async () => {
      // Character appearance sheets (e.g. the scientist) live on the
      // project but are not referenced by any map JSON — without the
      // fallback a placed Cast NPC could never resolve its sheet and
      // rendered the diamond marker instead of its sprite.
      const scientist = { data: { id: 'scientist' } } as unknown as SpriteSetResource
      const resource = new MapResource('maps/main.json', {
        headless: true,
        preloadedSpriteSets: new Map([['scientist', scientist]]),
      })
      expect(resource.getSpriteSetResource('scientist')).toBe(scientist)
      expect(resource.getSpriteSetResource('ghost')).toBe(undefined)
    })
  })

  await describe('MapResource.getFirstLayerId', async () => {
    await it('returns the first layer regardless of visibility (paint-target fallback)', async () => {
      const resource = new MapResource('maps/main.json', { headless: true })
      const withData = resource as unknown as { _mapData: unknown }
      withData._mapData = {
        layers: [
          { id: 'background', visible: false },
          { id: 'ground', visible: true },
        ],
      }
      // The first layer is hidden — it must STILL be the fallback target,
      // not silently redirected to the first *visible* layer (which would
      // make paint land on the wrong layer, or nowhere if all are hidden).
      expect(resource.getFirstLayerId()).toBe('background')
      // The visible-only query is unchanged — UI uses it for the layer list.
      expect(resource.getAvailableLayerIds()).toStrictEqual(['ground'])
    })

    await it('returns null when the map has no layers', async () => {
      const resource = new MapResource('maps/empty.json', { headless: true })
      const withData = resource as unknown as { _mapData: unknown }
      withData._mapData = { layers: [] }
      expect(resource.getFirstLayerId()).toBe(null)
    })
  })
}
