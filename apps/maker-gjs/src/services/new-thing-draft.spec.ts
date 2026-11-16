import { describe, expect, it } from '@gjsify/unit'

import { nextThingName, resolveThingName } from './new-thing-draft.ts'

export default async () => {
  await describe('nextThingName', async () => {
    await it('offers the template label in an empty library', async () => {
      expect(nextThingName('Chest', [])).toBe('Chest')
    })

    await it('steps past a taken name, starting at 2', async () => {
      expect(nextThingName('Chest', ['Chest'])).toBe('Chest 2')
      expect(nextThingName('Chest', ['Chest', 'Chest 2'])).toBe('Chest 3')
    })

    await it('does not number past names of other kinds', async () => {
      expect(nextThingName('Chest', ['Sign', 'Door', 'Door 2'])).toBe('Chest')
    })

    await it('compares trimmed, so a padded name still counts as taken', async () => {
      expect(nextThingName('Chest', ['  Chest  '])).toBe('Chest 2')
      expect(nextThingName('  Chest  ', ['Chest'])).toBe('Chest 2')
    })

    await it('answers empty for a label that is only whitespace', async () => {
      expect(nextThingName('   ', ['Chest'])).toBe('')
    })
  })

  await describe('resolveThingName', async () => {
    await it('takes what was typed', async () => {
      expect(resolveThingName('Treasure', 'Chest')).toBe('Treasure')
    })

    await it('trims what was typed', async () => {
      expect(resolveThingName('  Treasure ', 'Chest')).toBe('Treasure')
    })

    await it('keeps the suggestion when the field was cleared', async () => {
      expect(resolveThingName('', 'Chest')).toBe('Chest')
      expect(resolveThingName('   ', 'Chest')).toBe('Chest')
    })
  })
}
