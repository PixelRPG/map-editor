import { describe, expect, it } from '@gjsify/unit'

import { newFlag } from './flags-edit.ts'

export default async () => {
  await describe('newFlag', async () => {
    await it('starts from the kind default, trims the name and gives a readable id', async () => {
      const flag = newFlag([], '  Has the key ')
      expect(flag).toMatchObject({ name: 'Has the key', kind: 'yes-no', initial: false, scope: 'game' })
      expect(flag.id.startsWith('has-the-key-')).toBe(true)
      expect(newFlag([], 'Coins', 'number').initial).toBe(0)
      expect(newFlag([], 'Mood', 'text').initial).toBe('')
    })

    await it('takes the scope it is given, so a per-thing flag stays per-thing', async () => {
      expect(newFlag([], 'Chest open', 'yes-no', 'thing').scope).toBe('thing')
      expect(newFlag([], 'Chest open', 'yes-no').scope).toBe('game')
    })

    await it('never reuses an id of the list, even for the same name', async () => {
      const a = newFlag([], 'Key')
      const b = newFlag([a], 'Key')
      expect(b.id).not.toBe(a.id)
      expect(newFlag([a, b], 'Key').id).not.toBe(b.id)
    })
  })
}
