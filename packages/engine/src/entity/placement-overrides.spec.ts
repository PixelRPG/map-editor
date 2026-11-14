import { describe, expect, it } from '@gjsify/unit'
import { mergePlacementComponents } from './data-access.ts'
import { placementOverridesFrom } from './placement-overrides.ts'

export default async () => {
  await describe('placementOverridesFrom', async () => {
    await it('returns undefined when the edit changed nothing', async () => {
      const base = { name: 'Chest', components: [{ type: 'item', itemId: 'apple' }] }
      expect(placementOverridesFrom(base, { name: 'Chest', components: [{ type: 'item', itemId: 'apple' }] })).toBe(
        undefined,
      )
    })

    await it('ignores key order — the same data in another order is not an override', async () => {
      const base = { name: 'Chest', components: [{ type: 'item', itemId: 'apple', qty: 2 }] }
      const edited = { name: 'Chest', components: [{ qty: 2, itemId: 'apple', type: 'item' }] }
      expect(placementOverridesFrom(base, edited)).toBe(undefined)
    })

    await it('carries only the components that differ', async () => {
      const base = {
        name: 'Chest',
        components: [{ type: 'item', itemId: 'apple' }, { type: 'collision' }],
      }
      const edited = {
        name: 'Chest',
        components: [{ type: 'item', itemId: 'gold-apple' }, { type: 'collision' }],
      }
      expect(placementOverridesFrom(base, edited)).toStrictEqual({
        components: [{ type: 'item', itemId: 'gold-apple' }],
      })
    })

    await it('carries a renamed placement', async () => {
      const base = { name: 'Chest', components: [] }
      expect(placementOverridesFrom(base, { name: 'Royal chest', components: [] })).toStrictEqual({
        name: 'Royal chest',
      })
    })

    await it('carries a component type the base does not have', async () => {
      const base = { name: 'Chest', components: [] }
      const edited = { name: 'Chest', components: [{ type: 'trigger', on: 'walk-onto' }] }
      expect(placementOverridesFrom(base, edited)).toStrictEqual({
        components: [{ type: 'trigger', on: 'walk-onto' }],
      })
    })

    await it('round-trips through mergePlacementComponents', async () => {
      const base = {
        name: 'Chest',
        components: [{ type: 'item', itemId: 'apple', qty: 1 }, { type: 'collision' }],
      }
      const edited = {
        name: 'Royal chest',
        components: [
          { type: 'item', itemId: 'gold-apple', qty: 3 },
          { type: 'collision' },
          { type: 'trigger', on: 'walk-onto' },
        ],
      }
      const overrides = placementOverridesFrom(base, edited)
      expect(mergePlacementComponents(base.components, overrides?.components)).toStrictEqual(edited.components)
      expect(overrides?.name).toBe('Royal chest')
    })

    await it('drops an override the user set back to the library value', async () => {
      const base = { name: 'Chest', components: [{ type: 'item', itemId: 'apple' }] }
      const merged = mergePlacementComponents(base.components, [{ type: 'item', itemId: 'gold-apple' }])
      expect(placementOverridesFrom(base, { name: 'Chest', components: merged })).toStrictEqual({
        components: [{ type: 'item', itemId: 'gold-apple' }],
      })
      // …and back to the library's value: no override block at all.
      expect(placementOverridesFrom(base, { name: 'Chest', components: [{ type: 'item', itemId: 'apple' }] })).toBe(
        undefined,
      )
    })

    await it('does not treat a component missing from the edit as a deletion', async () => {
      // No tombstone in the schema: the base's component shows through.
      const base = { name: 'Chest', components: [{ type: 'collision' }] }
      expect(placementOverridesFrom(base, { name: 'Chest', components: [] })).toBe(undefined)
    })
  })
}
