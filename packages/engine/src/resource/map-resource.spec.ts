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
}
