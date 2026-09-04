import { describe, expect, it } from '@gjsify/unit'
import type { CharacterAnimation } from '@pixelrpg/engine'

import {
  filterSortTilesets,
  isBuiltInSpriteSet,
  moveBefore,
  orderByProjectSpriteSets,
  sheetAsCharacter,
  type TilesetSortKey,
  tilesetSortAtIndex,
} from './tiles-view-model.ts'

interface Entry extends TilesetSortKey {
  id: string
}

const entry = (id: string, name: string, spriteWidth: number, mapUsers: number): Entry => ({
  id,
  name,
  spriteWidth,
  mapUsers,
})

const keyOf = (e: Entry): TilesetSortKey => e
const idOf = (e: Entry): string => e.id
const ids = (entries: readonly Entry[] | null): string[] => (entries ?? []).map(idOf)

export default async () => {
  await describe('tilesetSortAtIndex', async () => {
    await it('maps dropdown rows to sort orders', async () => {
      expect(tilesetSortAtIndex(0)).toBe('default')
      expect(tilesetSortAtIndex(1)).toBe('name')
      expect(tilesetSortAtIndex(2)).toBe('size')
      expect(tilesetSortAtIndex(3)).toBe('usage')
    })

    await it('falls back to the default order outside the dropdown', async () => {
      expect(tilesetSortAtIndex(4)).toBe('default')
      expect(tilesetSortAtIndex(-1)).toBe('default')
    })
  })

  await describe('isBuiltInSpriteSet', async () => {
    await it('recognises the engine-provided prefix only', async () => {
      expect(isBuiltInSpriteSet('built-in:grass')).toBe(true)
      expect(isBuiltInSpriteSet('forest')).toBe(false)
      expect(isBuiltInSpriteSet('my-built-in:set')).toBe(false)
    })
  })

  await describe('filterSortTilesets', async () => {
    const entries = [entry('c', 'Cave', 16, 1), entry('a', 'Forest', 32, 5), entry('b', 'Beach', 8, 3)]

    await it('keeps the caller order for the default sort', async () => {
      expect(ids(filterSortTilesets(entries, keyOf, { search: '', sort: 'default' }))).toStrictEqual(['c', 'a', 'b'])
    })

    await it('filters case-insensitively on the display name', async () => {
      expect(ids(filterSortTilesets(entries, keyOf, { search: 'EA', sort: 'default' }))).toStrictEqual(['b'])
      expect(ids(filterSortTilesets(entries, keyOf, { search: '  fore ', sort: 'default' }))).toStrictEqual(['a'])
      expect(ids(filterSortTilesets(entries, keyOf, { search: 'nothing', sort: 'default' }))).toStrictEqual([])
    })

    await it('sorts by name, and by size / usage descending', async () => {
      expect(ids(filterSortTilesets(entries, keyOf, { search: '', sort: 'name' }))).toStrictEqual(['b', 'c', 'a'])
      expect(ids(filterSortTilesets(entries, keyOf, { search: '', sort: 'size' }))).toStrictEqual(['a', 'c', 'b'])
      expect(ids(filterSortTilesets(entries, keyOf, { search: '', sort: 'usage' }))).toStrictEqual(['a', 'b', 'c'])
    })

    await it('sorts what the search left over', async () => {
      expect(ids(filterSortTilesets(entries, keyOf, { search: 'e', sort: 'size' }))).toStrictEqual(['a', 'c', 'b'])
    })

    await it('keeps equal keys in caller order', async () => {
      const tied = [entry('x', 'X', 16, 2), entry('y', 'Y', 16, 2), entry('z', 'Z', 16, 2)]
      expect(ids(filterSortTilesets(tied, keyOf, { search: '', sort: 'size' }))).toStrictEqual(['x', 'y', 'z'])
      expect(ids(filterSortTilesets(tied, keyOf, { search: '', sort: 'usage' }))).toStrictEqual(['x', 'y', 'z'])
    })
  })

  await describe('orderByProjectSpriteSets', async () => {
    const entries = [entry('a', 'A', 8, 0), entry('b', 'B', 8, 0), entry('c', 'C', 8, 0)]

    await it('follows the project order', async () => {
      expect(ids(orderByProjectSpriteSets(entries, idOf, ['c', 'a', 'b']))).toStrictEqual(['c', 'a', 'b'])
    })

    await it('sorts ids the project does not list to the end, keeping their order', async () => {
      expect(ids(orderByProjectSpriteSets(entries, idOf, ['c']))).toStrictEqual(['c', 'a', 'b'])
      expect(ids(orderByProjectSpriteSets(entries, idOf, []))).toStrictEqual(['a', 'b', 'c'])
    })

    await it('ignores project ids that carry no item', async () => {
      expect(ids(orderByProjectSpriteSets(entries, idOf, ['gone', 'b', 'a', 'c']))).toStrictEqual(['b', 'a', 'c'])
    })
  })

  await describe('moveBefore', async () => {
    const entries = [entry('a', 'A', 8, 0), entry('b', 'B', 8, 0), entry('c', 'C', 8, 0)]

    await it('drops the dragged item immediately before the target, dragging up', async () => {
      expect(ids(moveBefore(entries, idOf, 'c', 'a'))).toStrictEqual(['c', 'a', 'b'])
      expect(ids(moveBefore(entries, idOf, 'c', 'b'))).toStrictEqual(['a', 'c', 'b'])
    })

    await it('drops it immediately before the target dragging down too — the removal never shifts it', async () => {
      expect(ids(moveBefore(entries, idOf, 'a', 'c'))).toStrictEqual(['b', 'a', 'c'])
      // Already directly before the target, so the order is unchanged.
      expect(ids(moveBefore(entries, idOf, 'a', 'b'))).toStrictEqual(['a', 'b', 'c'])
    })

    await it('reports a no-op for a self-drop or an unknown id', async () => {
      expect(moveBefore(entries, idOf, 'a', 'a')).toBe(null)
      expect(moveBefore(entries, idOf, 'zz', 'a')).toBe(null)
      expect(moveBefore(entries, idOf, 'a', 'zz')).toBe(null)
    })

    await it('leaves the input untouched', async () => {
      moveBefore(entries, idOf, 'c', 'a')
      expect(ids(entries)).toStrictEqual(['a', 'b', 'c'])
    })
  })

  await describe('sheetAsCharacter', async () => {
    const sheets = [{ id: 'hero-sheet', name: 'Hero sheet' }]
    const walk: CharacterAnimation = { id: 'walk-down', frames: [] }
    const animationsOf = (id: string): CharacterAnimation[] => (id === 'hero-sheet' ? [walk] : [])

    await it('binds the sheet id as both character id and sprite-set id', async () => {
      expect(sheetAsCharacter('hero-sheet', sheets, animationsOf)).toStrictEqual({
        id: 'hero-sheet',
        name: 'Hero sheet',
        kind: 'hero',
        spriteSetId: 'hero-sheet',
        defaultAnimation: 'idle-down',
        animations: [walk],
      })
    })

    await it('falls back to the raw id when the sheet is not listed', async () => {
      expect(sheetAsCharacter('orphan', sheets, animationsOf)?.name).toBe('orphan')
    })

    await it('has nothing to render without a sheet', async () => {
      expect(sheetAsCharacter(null, sheets, animationsOf)).toBe(null)
    })
  })
}
