import { describe, expect, it, vi } from 'vitest'
import { isValidTileCoords, isValidTileId } from './sprite.validator.ts'

describe('isValidTileId', () => {
  it('accepts non-negative integers', () => {
    expect(isValidTileId(0)).toBe(true)
    expect(isValidTileId(42)).toBe(true)
  })

  it('rejects negative numbers and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isValidTileId(-1)).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rejects non-number values via runtime guard', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isValidTileId('5' as unknown as number)).toBe(false)
    warn.mockRestore()
  })
})

describe('isValidTileCoords', () => {
  it('accepts non-negative coordinate pairs', () => {
    expect(isValidTileCoords(0, 0)).toBe(true)
    expect(isValidTileCoords(7, 11)).toBe(true)
  })

  it('rejects pairs with any negative component', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isValidTileCoords(-1, 0)).toBe(false)
    expect(isValidTileCoords(0, -1)).toBe(false)
    warn.mockRestore()
  })
})
