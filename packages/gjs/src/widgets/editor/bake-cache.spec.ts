/**
 * The MapPreview bake cache + cache-key builder.
 *
 * Two correctness contracts are pinned here:
 *  - the cache is least-recently-STORED (not -read): `set` refreshes order,
 *    `get` does not — so a read can't save an entry from eviction; and
 *  - the cache key rounds the viewport centre to the nearest pixel, so a
 *    tiny pan re-uses the cached bake instead of forcing a redundant
 *    re-render.
 */

import { describe, expect, it } from '@gjsify/unit'

import { BakeCache, buildCacheKey } from './bake-cache.ts'

export default async () => {
  await describe('BakeCache', async () => {
    await it('misses on an unknown key', async () => {
      const cache = new BakeCache<number>(2)
      expect(cache.get('x')).toBe(undefined)
    })

    await it('stores and retrieves a value', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      expect(cache.get('a')).toBe(1)
      expect(cache.size).toBe(1)
    })

    await it('updates the value when an existing key is re-set', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      cache.set('a', 2)
      expect(cache.get('a')).toBe(2)
      expect(cache.size).toBe(1)
    })

    await it('keeps exactly maxSize entries without evicting', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      expect(cache.size).toBe(2)
      expect(cache.get('a')).toBe(1)
      expect(cache.get('b')).toBe(2)
    })

    await it('evicts the oldest-stored entry when exceeding maxSize', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3) // size 3 > 2 → evict 'a'
      expect(cache.size).toBe(2)
      expect(cache.get('a')).toBe(undefined)
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
    })

    await it('does NOT refresh order on read (least-recently-stored, not -read)', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.get('a') // a read must not save 'a' from eviction
      cache.set('c', 3) // evicts the oldest STORED → 'a'
      expect(cache.get('a')).toBe(undefined)
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
    })

    await it('refreshes order when re-storing a key, so it survives the next eviction', async () => {
      const cache = new BakeCache<number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('a', 11) // re-store 'a' → now newest; 'b' is oldest
      cache.set('c', 3) // evicts the oldest STORED → 'b'
      expect(cache.get('b')).toBe(undefined)
      expect(cache.get('a')).toBe(11)
      expect(cache.get('c')).toBe(3)
    })
  })

  await describe('buildCacheKey', async () => {
    await it('returns null for a null base (not cacheable)', async () => {
      expect(buildCacheKey(null, null)).toBe(null)
      expect(buildCacheKey(null, { centerX: 1, centerY: 2, zoom: 3 })).toBe(null)
    })

    await it('keys on the base alone when there is no viewport', async () => {
      expect(buildCacheKey('path:/p', null)).toBe('path:/p')
    })

    await it('appends a rounded viewport suffix', async () => {
      expect(buildCacheKey('map:/p:m1:fp', { centerX: 100, centerY: 200, zoom: 3 })).toBe('map:/p:m1:fp:vp:3:100:200')
    })

    await it('rounds the centre so nearby pans collapse to the same key', async () => {
      expect(buildCacheKey('b', { centerX: 12.4, centerY: 0, zoom: 2 })).toBe('b:vp:2:12:0')
      expect(buildCacheKey('b', { centerX: 12.6, centerY: 0, zoom: 2 })).toBe('b:vp:2:13:0')
    })

    await it('rounds negative centres', async () => {
      expect(buildCacheKey('b', { centerX: -8.5, centerY: -0.4, zoom: 1 })).toBe('b:vp:1:-8:0')
    })
  })
}
