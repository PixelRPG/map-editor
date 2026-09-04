import { describe, expect, it } from '@gjsify/unit'
import { REQUIRED_ROLES, type SpriteSetData, type SpriteSetReference } from '@pixelrpg/engine'

import {
  buildImportedSpriteSetData,
  nextFirstGid,
  orderSpriteSetReferences,
  withImagePath,
  writeTileSurface,
} from './project-store-sprite-sets.ts'

const ref = (id: string, firstGid: number): SpriteSetReference => ({
  id,
  path: `./spritesets/${id}.json`,
  type: 'spriteset',
  firstGid,
})

const spriteSet = (overrides: Partial<SpriteSetData> = {}): SpriteSetData =>
  ({
    version: '1.0.0',
    id: 'source',
    name: 'Source',
    image: { id: 'main', type: 'image', path: 'whatever/the-user-picked.png' },
    spriteWidth: 16,
    spriteHeight: 16,
    columns: 2,
    rows: 1,
    sprites: [
      { id: 0, col: 0, row: 0 },
      { id: 1, col: 1, row: 0 },
    ],
    ...overrides,
  }) as unknown as SpriteSetData

export default async () => {
  await describe('nextFirstGid', async () => {
    await it('starts at 1 for an empty project', async () => {
      expect(nextFirstGid([], () => 0)).toBe(1)
    })

    await it('lands one past the highest gid any set occupies', async () => {
      const counts: Record<string, number> = { a: 4, b: 10 }
      expect(nextFirstGid([ref('a', 1), ref('b', 5)], (id) => counts[id] ?? 0)).toBe(15)
    })

    await it('ignores a set that is referenced but not loaded (count 0)', async () => {
      expect(nextFirstGid([ref('a', 1), ref('unloaded', 9)], () => 0)).toBe(9)
    })

    await it('falls back to the running gid for a reference without one', async () => {
      const withoutGid = { ...ref('a', 0), firstGid: undefined } as unknown as SpriteSetReference
      expect(nextFirstGid([withoutGid], () => 3)).toBe(4)
    })
  })

  await describe('orderSpriteSetReferences', async () => {
    await it('reports null when the order is already current', async () => {
      const refs = [ref('a', 1), ref('b', 2)]
      expect(orderSpriteSetReferences(refs, ['a', 'b'])).toBeNull()
    })

    await it('reorders to the given ids', async () => {
      const refs = [ref('a', 1), ref('b', 2), ref('c', 3)]
      expect(orderSpriteSetReferences(refs, ['c', 'a', 'b'])?.map((r) => r.id)).toStrictEqual(['c', 'a', 'b'])
    })

    await it('keeps unlisted references in their relative order at the end', async () => {
      const refs = [ref('a', 1), ref('b', 2), ref('c', 3)]
      expect(orderSpriteSetReferences(refs, ['c'])?.map((r) => r.id)).toStrictEqual(['c', 'a', 'b'])
    })
  })

  await describe('withImagePath', async () => {
    await it('repoints the image without dropping its other fields', async () => {
      const out = withImagePath(spriteSet(), 'hero.png')
      expect(out.image?.path).toBe('hero.png')
      expect(out.image?.id).toBe('main')
      expect(out.image?.type).toBe('image')
    })

    await it('synthesises an image reference when the source carries none', async () => {
      const out = withImagePath(spriteSet({ image: undefined }), 'hero.png')
      expect(out.image?.id).toBe('main')
      expect(out.image?.path).toBe('hero.png')
    })
  })

  await describe('buildImportedSpriteSetData', async () => {
    await it('adopts the project id, pins the image and defaults to a tileset', async () => {
      const out = buildImportedSpriteSetData(spriteSet(), 'hero-2', 'hero-2.png')
      expect(out.id).toBe('hero-2')
      expect(out.image?.path).toBe('hero-2.png')
      expect(out.kind).toBe('tileset')
      expect(out.characterAnimations).toBeUndefined()
    })

    await it('seeds every required role on a character sheet', async () => {
      const out = buildImportedSpriteSetData(spriteSet({ kind: 'character' }), 'hero', 'hero.png')
      expect(out.characterAnimations).toHaveLength(REQUIRED_ROLES.length)
      expect(out.characterAnimations?.map((a) => a.id)).toStrictEqual([...REQUIRED_ROLES])
      expect(out.characterAnimations?.[0]?.frames).toHaveLength(1)
    })

    await it('keeps animations the source already carried', async () => {
      const existing = [{ id: 'idle-down', frames: [{ spriteId: 7, duration: 120 }] }]
      const out = buildImportedSpriteSetData(
        spriteSet({ kind: 'character', characterAnimations: existing as never }),
        'hero',
        'hero.png',
      )
      expect(out.characterAnimations).toHaveLength(1)
      expect(out.characterAnimations?.[0]?.frames[0]?.spriteId).toBe(7)
    })

    await it('leaves the source descriptor untouched', async () => {
      const source = spriteSet()
      buildImportedSpriteSetData(source, 'hero', 'hero.png')
      expect(source.id).toBe('source')
      expect(source.image?.path).toBe('whatever/the-user-picked.png')
    })
  })

  await describe('writeTileSurface', async () => {
    await it('sets a surface, preserving sibling tile properties', async () => {
      const def = { id: 0, col: 0, row: 0, tileProperties: { walkable: true } } as SpriteSetData['sprites'][number]
      writeTileSurface(def, 'grass')
      expect(def.tileProperties?.surface).toBe('grass')
      expect(def.tileProperties?.walkable).toBe(true)
    })

    await it('drops tileProperties entirely once the surface was its only key', async () => {
      const def = { id: 0, col: 0, row: 0 } as SpriteSetData['sprites'][number]
      writeTileSurface(def, 'stone')
      writeTileSurface(def, null)
      expect(def.tileProperties).toBeUndefined()
    })

    await it('clears only the surface when other tile properties remain', async () => {
      const def = {
        id: 0,
        col: 0,
        row: 0,
        tileProperties: { surface: 'stone', walkable: false },
      } as SpriteSetData['sprites'][number]
      writeTileSurface(def, null)
      expect(def.tileProperties?.surface).toBeUndefined()
      expect(def.tileProperties?.walkable).toBe(false)
    })

    await it('is a no-op when clearing a sprite that never had a surface', async () => {
      const def = { id: 0, col: 0, row: 0, tileProperties: { walkable: true } } as SpriteSetData['sprites'][number]
      writeTileSurface(def, null)
      expect(def.tileProperties?.walkable).toBe(true)
    })
  })
}
