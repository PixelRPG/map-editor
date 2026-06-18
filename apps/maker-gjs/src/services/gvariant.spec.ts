import { describe, expect, it } from '@gjsify/unit'

import { variantKindFor } from './gvariant.ts'

export default async () => {
  await describe('variantKindFor', async () => {
    await it('honours a known declared scalar type over JS inference', async () => {
      expect(variantKindFor('s', 42)).toBe('s')
      expect(variantKindFor('b', 'true')).toBe('b')
      expect(variantKindFor('i', 'x')).toBe('i')
      expect(variantKindFor('u', 1)).toBe('u')
      expect(variantKindFor('d', 7)).toBe('d') // whole-number value, declared double → stays double
    })

    await it('infers from the JS runtime type when no declared type is given', async () => {
      expect(variantKindFor(null, 'hello')).toBe('s')
      expect(variantKindFor(null, true)).toBe('b')
      expect(variantKindFor(null, 3)).toBe('i') // integer → int32
      expect(variantKindFor(null, 3.5)).toBe('d') // non-integer → double
    })

    await it('ignores a non-scalar declared type and falls back to inference', async () => {
      // e.g. an array/tuple action type "(ii)" isn't a marshalled scalar.
      expect(variantKindFor('(ii)', 'fallback')).toBe('s')
    })

    await it('throws for a value it cannot marshal', async () => {
      expect(() => variantKindFor(null, { a: 1 })).toThrow(/Cannot build a GLib.Variant/)
      expect(() => variantKindFor(null, undefined)).toThrow(/Cannot build a GLib.Variant/)
    })
  })
}
