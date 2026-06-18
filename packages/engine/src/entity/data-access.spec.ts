import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition } from '../types/data/index.ts'
import { getComponentData, mergePlacementComponents, resolvePlacementDefinition } from './data-access.ts'

export default async () => {
  await describe('getComponentData', async () => {
    await it('returns the first component of the requested type', async () => {
      const def = { components: [{ type: 'collision' }, { type: 'item', itemId: 'apple' }] }
      expect(getComponentData(def, 'item')?.itemId).toBe('apple')
    })

    await it('returns undefined when the type is absent', async () => {
      expect(getComponentData({ components: [] }, 'visual')).toBe(undefined)
    })
  })

  await describe('mergePlacementComponents', async () => {
    await it('copies the base when there are no overrides', async () => {
      const base = [{ type: 'collision' }]
      const merged = mergePlacementComponents(base)
      expect(merged).toStrictEqual(base)
      expect(merged[0] === base[0]).toBe(false) // fresh copies, inputs untouched
    })

    await it('wholesale-replaces per type and appends new types', async () => {
      const base = [{ type: 'item', itemId: 'apple', qty: 1 }, { type: 'collision' }]
      const merged = mergePlacementComponents(base, [
        { type: 'item', itemId: 'gold-apple' },
        { type: 'trigger', on: 'walk-onto' },
      ])
      expect(merged).toStrictEqual([
        { type: 'item', itemId: 'gold-apple' }, // replaced wholesale — no deep merge of `qty`
        { type: 'collision' },
        { type: 'trigger', on: 'walk-onto' },
      ])
    })
  })

  await describe('resolvePlacementDefinition', async () => {
    const library: EntityDefinition[] = [
      { id: 'apple', name: 'Apple', components: [{ type: 'item', itemId: 'apple' }] },
      {
        id: 'cave-door',
        name: 'Cave Door',
        components: [{ type: 'teleport', targetMapId: 'cave', targetTileX: 1, targetTileY: 2 }],
      },
    ]

    await it('returns the inline definition verbatim', async () => {
      const inline: EntityDefinition = { id: 'd', name: 'D', components: [] }
      const placement = { id: 'p', layerId: 'l1', tileX: 0, tileY: 0, inline }
      expect(resolvePlacementDefinition(placement, library)).toBe(inline)
    })

    await it('looks up a library entry by defId', async () => {
      const placement = { id: 'p', layerId: 'l1', tileX: 0, tileY: 0, defId: 'apple' }
      expect(resolvePlacementDefinition(placement, library)?.name).toBe('Apple')
    })

    await it('resolves a defId teleport — the atlas-overlay case', async () => {
      // The atlas teleport overlay used to read `placement.inline` only,
      // so an object-brush placement (defId into the entity library)
      // never showed its connection. The canonical resolver covers it.
      const placement = { id: 'p', layerId: 'l1', tileX: 3, tileY: 4, defId: 'cave-door' }
      const resolved = resolvePlacementDefinition(placement, library)
      expect(getComponentData(resolved ?? { components: [] }, 'teleport')?.targetMapId).toBe('cave')
    })

    await it('merges overrides — name replace + wholesale-replace component per type', async () => {
      const placement = {
        id: 'p',
        layerId: 'l1',
        tileX: 0,
        tileY: 0,
        defId: 'apple',
        overrides: { name: 'Golden', components: [{ type: 'item', itemId: 'gold-apple', qty: 5 }] },
      }
      const resolved = resolvePlacementDefinition(placement, library)
      expect(resolved?.name).toBe('Golden')
      expect(resolved?.components).toStrictEqual([{ type: 'item', itemId: 'gold-apple', qty: 5 }])
    })

    await it('returns null when neither inline nor a known defId resolves', async () => {
      expect(resolvePlacementDefinition({ id: 'p', layerId: 'l1', tileX: 0, tileY: 0, defId: 'ghost' }, library)).toBe(
        null,
      )
    })

    await it('deep-clones states on the override path so the library is never aliased', async () => {
      const stateful: EntityDefinition = {
        id: 'door',
        name: 'Door',
        components: [{ type: 'collision' }],
        states: [{ id: 'open', components: [{ type: 'visual', spriteSetId: 's', spriteId: 1 }] }],
      }
      const placement = {
        id: 'p',
        layerId: 'l1',
        tileX: 0,
        tileY: 0,
        defId: 'door',
        overrides: { name: 'Side Door' },
      }
      const resolved = resolvePlacementDefinition(placement, [stateful])
      expect(resolved?.states).toStrictEqual(stateful.states)
      // …but the arrays + their components are fresh copies, not the library's.
      expect(resolved?.states === stateful.states).toBe(false)
      expect(resolved?.states?.[0] === stateful.states?.[0]).toBe(false)
      expect(resolved?.states?.[0].components[0] === stateful.states?.[0].components[0]).toBe(false)
    })
  })
}
