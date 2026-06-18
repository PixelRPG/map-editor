import { describe, expect, it } from '@gjsify/unit'

import { isValidTileId } from './sprite.validator.ts'

async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('isValidTileId', async () => {
    await it('accepts non-negative integers', async () => {
      expect(isValidTileId(0)).toBe(true)
      expect(isValidTileId(42)).toBe(true)
    })

    await it('rejects negative numbers and warns', async () => {
      const result = await muteWarn(() => isValidTileId(-1))
      expect(result).toBe(false)
    })

    await it('rejects non-number values via runtime guard', async () => {
      const result = await muteWarn(() => isValidTileId('5' as unknown as number))
      expect(result).toBe(false)
    })
  })
}
