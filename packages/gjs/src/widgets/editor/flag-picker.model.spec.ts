import { describe, expect, it } from '@gjsify/unit'

import {
  cleanNewFlagName,
  existingFlagId,
  flagDisplayName,
  flagPickerOptions,
  isNewFlagChoice,
  NEW_FLAG_VALUE,
} from './flag-picker.model.ts'

const labels = { none: '(None)', create: 'New…', missing: 'Missing flag' }
const flags = [
  { value: 'has-key', label: 'Has Key' },
  { value: 'coins', label: 'Coins' },
]

export default async () => {
  await describe('flag-picker.model', async () => {
    await it('lists none, the flags by name, then New…', async () => {
      const rows = flagPickerOptions(flags, 'coins', labels)
      expect(rows.map((r) => r.label)).toStrictEqual(['(None)', 'Has Key', 'Coins', 'New…'])
      expect(rows[rows.length - 1].value).toBe(NEW_FLAG_VALUE)
    })

    await it('keeps a stored id the project lost visible', async () => {
      const rows = flagPickerOptions(flags, 'gone', labels)
      expect(rows.map((r) => r.value)).toStrictEqual(['', 'has-key', 'coins', 'gone', NEW_FLAG_VALUE])
      expect(rows[3].label).toBe('Missing flag')
    })

    await it('adds no missing row for an empty choice', async () => {
      expect(flagPickerOptions(flags, '', labels).length).toBe(4)
    })

    await it('names a lost flag "Missing flag", never its raw id', async () => {
      expect(flagDisplayName(flags, 'coins', 'Missing flag')).toBe('Coins')
      expect(flagDisplayName(flags, 'has-key-6c6e44d0', 'Missing flag')).toBe('Missing flag')
      expect(flagDisplayName([], 'coins', 'Missing flag')).toBe('Missing flag')
    })

    await it('recognises the New… entry', async () => {
      expect(isNewFlagChoice(NEW_FLAG_VALUE)).toBe(true)
      expect(isNewFlagChoice('coins')).toBe(false)
    })

    await it('trims a new name and refuses empty or duplicate ones', async () => {
      expect(cleanNewFlagName('  Met Mido ', flags)).toBe('Met Mido')
      expect(cleanNewFlagName('   ', flags)).toBe(null)
      expect(cleanNewFlagName('has key', flags)).toBe(null)
    })

    await it('finds a flag by name, case-blind', async () => {
      expect(existingFlagId('COINS', flags)).toBe('coins')
      expect(existingFlagId('nope', flags)).toBe(null)
    })
  })
}
