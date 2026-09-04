import { describe, expect, it } from '@gjsify/unit'

import { PreviewCache } from './cast-controller-preview-cache.ts'

export default async () => {
  await describe('PreviewCache', async () => {
    await it('loads once per id and serves the memoised value afterwards', async () => {
      const loads: string[] = []
      const cache = new PreviewCache<string>(async (id) => {
        loads.push(id)
        return `preview:${id}`
      })

      expect(await cache.get('a')).toBe('preview:a')
      expect(await cache.get('a')).toBe('preview:a')
      expect(await cache.get('b')).toBe('preview:b')
      expect(loads).toStrictEqual(['a', 'b'])
    })

    await it('caches a failed lookup so a broken reference cannot retry-storm', async () => {
      // Every cast refresh resolves one preview per referenced set; an
      // uncached miss would re-probe the missing sheet on each of them.
      const loads: string[] = []
      const cache = new PreviewCache<string>(async (id) => {
        loads.push(id)
        return null
      })

      expect(await cache.get('missing')).toBeNull()
      expect(await cache.get('missing')).toBeNull()
      expect(loads).toStrictEqual(['missing'])
    })

    await it('evict() reloads only the invalidated id', async () => {
      const loads: string[] = []
      const cache = new PreviewCache<string>(async (id) => {
        loads.push(id)
        return `preview:${id}`
      })
      await cache.get('a')
      await cache.get('b')
      cache.evict('a')
      await cache.get('a')
      await cache.get('b')
      expect(loads).toStrictEqual(['a', 'b', 'a'])
    })

    await it('clear() drops every entry so a new project cannot inherit stale textures', async () => {
      const loads: string[] = []
      const cache = new PreviewCache<string>(async (id) => {
        loads.push(id)
        return `preview:${id}`
      })
      await cache.get('a')
      cache.clear()
      await cache.get('a')
      expect(loads).toStrictEqual(['a', 'a'])
    })
  })
}
