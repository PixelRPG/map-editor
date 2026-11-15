import { describe, expect, it } from '@gjsify/unit'

import { fillPlaceholders } from './placeholders.ts'

export default async () => {
  await describe('fillPlaceholders', async () => {
    await it('fills both placeholders', async () => {
      expect(fillPlaceholders('%1$s ↔ %2$s', 'Forest', 'Village')).toBe('Forest ↔ Village')
    })

    await it('honours a translation that reorders the arguments', async () => {
      expect(fillPlaceholders('von %2$s nach %1$s', 'Forest', 'Village')).toBe('von Village nach Forest')
    })

    await it('does not substitute into a value it just inserted', async () => {
      // The trap a sequential pair of `.replace()` calls falls into.
      expect(fillPlaceholders('%1$s ↔ %2$s', '%2$s', 'Village')).toBe('%2$s ↔ Village')
    })

    await it('inserts a $ sequence verbatim', async () => {
      // `'$&'` in a replacement STRING means the whole match; as a
      // function result it is just two characters.
      expect(fillPlaceholders('%1$s', '$& $1 100%')).toBe('$& $1 100%')
    })

    await it('repeats a placeholder used twice', async () => {
      expect(fillPlaceholders('%1$s → %1$s', 'Cave')).toBe('Cave → Cave')
    })

    await it('leaves a placeholder with no value standing', async () => {
      expect(fillPlaceholders('%1$s ↔ %2$s', 'Forest')).toBe('Forest ↔ %2$s')
    })

    await it('leaves a plain %s alone', async () => {
      expect(fillPlaceholders('%s of %1$s', 'Forest')).toBe('%s of Forest')
    })
  })
}
