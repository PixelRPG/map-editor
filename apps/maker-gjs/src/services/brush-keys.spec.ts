import { describe, expect, it } from '@gjsify/unit'

import { terrainBrushKey, terrainIdOfBrushKey, tileBrushKey, tileIdOfBrushKey } from './brush-keys.ts'

export default async () => {
  await describe('brush keys', async () => {
    await it('keeps tile 3 and terrain "3" apart', async () => {
      expect(tileBrushKey(3) === terrainBrushKey('3')).toBe(false)
      expect(terrainIdOfBrushKey(tileBrushKey(3))).toBe(null)
      expect(tileIdOfBrushKey(terrainBrushKey('3'))).toBe(null)
    })

    await it('round-trips both kinds', async () => {
      expect(tileIdOfBrushKey(tileBrushKey(0))).toBe(0)
      expect(tileIdOfBrushKey(tileBrushKey(912))).toBe(912)
      expect(terrainIdOfBrushKey(terrainBrushKey('ground-path'))).toBe('ground-path')
    })

    await it('returns an id that contains a colon whole', async () => {
      expect(terrainIdOfBrushKey(terrainBrushKey('kenney:water'))).toBe('kenney:water')
    })

    await it('has nothing to say about a key it did not mint', async () => {
      expect(terrainIdOfBrushKey('thing:chest')).toBe(null)
      expect(tileIdOfBrushKey('thing:chest')).toBe(null)
      expect(tileIdOfBrushKey('tile:grass')).toBe(null)
    })
  })
}
