import { describe, expect, it } from '@gjsify/unit'
import { zFor } from '../components/tilemap-plane.component.ts'
import { DEPTH_BAND, depthModeOf, depthZ, mapHeightPx } from './depth-sort.ts'

const H = 1000

export default async () => {
  await describe('depthZ', async () => {
    await it('leaves ground and overlay at exactly their plane z', async () => {
      expect(depthZ({ plane: 'ground', footY: 900, mapHeightPx: H })).toBe(zFor('ground'))
      expect(depthZ({ plane: 'overlay', footY: 900, mapHeightPx: H })).toBe(zFor('overlay'))
    })

    await it('puts a thing further south in front on the hero plane', async () => {
      const north = depthZ({ plane: 'hero', footY: 200, mapHeightPx: H })
      const south = depthZ({ plane: 'hero', footY: 300, mapHeightPx: H })
      expect(south).toBeGreaterThan(north)
    })

    await it('stays inside the hero band, above its tilemap and below the overlay', async () => {
      const top = depthZ({ plane: 'hero', footY: -50, mapHeightPx: H })
      const bottom = depthZ({ plane: 'hero', footY: H * 2, mapHeightPx: H })
      expect(top).toBe(zFor('hero') + 1)
      expect(bottom).toBe(zFor('hero') + 1 + DEPTH_BAND)
      expect(bottom).toBeLessThan(zFor('overlay'))
    })

    await it('follows the storey', async () => {
      expect(depthZ({ plane: 'hero', footY: 0, mapHeightPx: H, elevation: 1 })).toBe(zFor('hero', 1) + 1)
    })

    await it('does not divide by zero on an unloaded map', async () => {
      expect(depthZ({ plane: 'hero', footY: 10, mapHeightPx: 0 })).toBe(zFor('hero') + 1)
      expect(mapHeightPx(null)).toBe(0)
      expect(mapHeightPx({ rows: 4, tileHeight: 16 })).toBe(64)
    })

    await it('pins an always-behind thing under every sorted one, above the tilemap', async () => {
      const lowest = depthZ({ plane: 'hero', footY: -50, mapHeightPx: H })
      const behind = depthZ({ plane: 'hero', footY: H, mapHeightPx: H, depth: 'behind' })
      expect(behind).toBeLessThan(lowest)
      expect(behind).toBeGreaterThan(zFor('hero'))
    })

    await it('pins an always-in-front thing over every sorted one, under the overlay', async () => {
      const highest = depthZ({ plane: 'hero', footY: H * 2, mapHeightPx: H })
      const front = depthZ({ plane: 'hero', footY: 0, mapHeightPx: H, depth: 'in-front' })
      expect(front).toBeGreaterThan(highest)
      expect(front).toBeLessThan(zFor('overlay'))
    })

    await it('ignores the foot once pinned, so equal z keeps spawn order', async () => {
      const a = depthZ({ plane: 'hero', footY: 10, mapHeightPx: H, depth: 'behind' })
      const b = depthZ({ plane: 'hero', footY: 900, mapHeightPx: H, depth: 'behind' })
      expect(a).toBe(b)
    })

    await it('treats an absent or unknown depth as sorted', async () => {
      const plain = depthZ({ plane: 'hero', footY: 300, mapHeightPx: H })
      expect(depthZ({ plane: 'hero', footY: 300, mapHeightPx: H, depth: 'sorted' })).toBe(plain)
      expect(depthModeOf(undefined)).toBe('sorted')
      expect(depthModeOf('nonsense')).toBe('sorted')
      expect(depthModeOf('behind')).toBe('behind')
    })

    await it('leaves other planes flat whatever the override says', async () => {
      expect(depthZ({ plane: 'ground', footY: 0, mapHeightPx: H, depth: 'in-front' })).toBe(zFor('ground'))
    })
  })
}
