import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition } from '@pixelrpg/engine'

import { groupThingsByCategory, OBJECTS_CATEGORY, thingCategory } from './thing-categories.ts'

const thing = (id: string, category?: string): EntityDefinition => ({
  id,
  name: id,
  components: [],
  ...(category === undefined ? {} : { editorData: { category } }),
})

export default async () => {
  await describe('thingCategory', async () => {
    await it('is the entity’s editorData.category', async () => {
      expect(thingCategory(thing('link', 'hero'))).toBe('hero')
    })

    await it('falls back to Objects for a missing or blank category', async () => {
      expect(thingCategory(thing('chest'))).toBe(OBJECTS_CATEGORY)
      expect(thingCategory(thing('sign', '  '))).toBe(OBJECTS_CATEGORY)
    })
  })

  await describe('groupThingsByCategory', async () => {
    await it('puts Objects first, then Heroes and NPCs, and keeps library order inside a group', async () => {
      const groups = groupThingsByCategory([
        thing('villager', 'npc'),
        thing('chest'),
        thing('link', 'hero'),
        thing('door'),
      ])
      expect(groups.map((g) => g.label)).toStrictEqual(['Objects', 'Heroes', 'NPCs'])
      expect(groups[0].things.map((t) => t.id)).toStrictEqual(['chest', 'door'])
    })

    await it('drops empty groups', async () => {
      expect(groupThingsByCategory([thing('chest')]).map((g) => g.key)).toStrictEqual([OBJECTS_CATEGORY])
      expect(groupThingsByCategory([])).toStrictEqual([])
    })

    await it('appends categories it does not know after the known ones, alphabetically and capitalised', async () => {
      const groups = groupThingsByCategory([
        thing('slime', 'monster'),
        thing('chest'),
        thing('sword', 'gear'),
        thing('link', 'hero'),
      ])
      expect(groups.map((g) => g.label)).toStrictEqual(['Objects', 'Heroes', 'Gear', 'Monster'])
    })
  })
}
