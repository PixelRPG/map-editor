/**
 * Which stacked placement a click selects.
 *
 * The back-to-front scan is what makes the selection agree with what is
 * drawn: `MapResource` renders later array entries on top, so picking
 * the FIRST match would select an object hidden underneath the one the
 * user aimed at.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { ObjectPlacement } from '../types/data/index.ts'
import { pickTopmostPlacementAt } from './placement-picking.ts'

function at(id: string, tileX: number, tileY: number): ObjectPlacement {
  return { id, layerId: 'ground', tileX, tileY, defId: 'thing' }
}

export default async () => {
  await describe('pickTopmostPlacementAt', async () => {
    await it('finds the placement on the clicked tile', async () => {
      const placements = [at('a', 0, 0), at('b', 3, 4)]
      expect(pickTopmostPlacementAt(placements, 3, 4)?.id).toBe('b')
    })

    await it('picks the LAST match when several stack on one tile', async () => {
      const placements = [at('under', 2, 2), at('middle', 2, 2), at('top', 2, 2)]
      expect(pickTopmostPlacementAt(placements, 2, 2)?.id).toBe('top')
    })

    await it('picks across layers — the array order decides, not the layer', async () => {
      const placements = [
        { ...at('roof', 1, 1), layerId: 'overlay' },
        { ...at('floor', 1, 1), layerId: 'ground' },
      ]
      expect(pickTopmostPlacementAt(placements, 1, 1)?.id).toBe('floor')
    })

    await it('returns null on an empty tile', async () => {
      expect(pickTopmostPlacementAt([at('a', 0, 0)], 5, 5)).toBe(null)
    })

    await it('returns null for an empty placement list', async () => {
      expect(pickTopmostPlacementAt([], 0, 0)).toBe(null)
    })

    await it('matches both coordinates, not either', async () => {
      const placements = [at('a', 1, 9), at('b', 9, 1)]
      expect(pickTopmostPlacementAt(placements, 1, 1)).toBe(null)
    })
  })
}
