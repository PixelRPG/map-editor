import { describe, expect, it } from '@gjsify/unit'

import { tupleKindsFor, tupleMembersFor, variantKindFor } from './gvariant.ts'

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
      // A tuple type isn't a marshalled SCALAR. `buildVariant` asks
      // `tupleMembersFor` before it gets here, so this fallback only
      // applies to a declared type nothing else recognises.
      expect(variantKindFor('(ii)', 'fallback')).toBe('s')
    })

    await it('throws for a value it cannot marshal', async () => {
      expect(() => variantKindFor(null, { a: 1 })).toThrow(/Cannot build a GLib.Variant/)
      expect(() => variantKindFor(null, undefined)).toThrow(/Cannot build a GLib.Variant/)
    })
  })

  await describe('tupleKindsFor', async () => {
    await it('splits a tuple type into its member kinds', async () => {
      expect(tupleKindsFor('(ss)')).toStrictEqual(['s', 's'])
      expect(tupleKindsFor('(sid)')).toStrictEqual(['s', 'i', 'd'])
      expect(tupleKindsFor('()')).toStrictEqual([])
    })

    await it('answers null for everything that is not a tuple', async () => {
      // null, not a throw: this is the question "is it a tuple?", and
      // every scalar action in the app asks it on the way through.
      expect(tupleKindsFor('s')).toBe(null)
      expect(tupleKindsFor(null)).toBe(null)
      expect(tupleKindsFor('as')).toBe(null)
    })

    await it('throws on a member kind it cannot marshal', async () => {
      // Silently dropping it would build a SHORTER tuple, which
      // `activate_action` rejects as a type mismatch — on stderr, where
      // nobody is looking.
      expect(() => tupleKindsFor('(sv)')).toThrow(/tuple member "v"/)
      expect(() => tupleKindsFor('(s(ss))')).toThrow(/tuple member "\("/)
    })
  })

  await describe('tupleMembersFor', async () => {
    await it('pairs each member kind with its value', async () => {
      expect(tupleMembersFor('(ss)', ['kokiri-forest', 'chest-1'])).toStrictEqual([
        ['s', 'kokiri-forest'],
        ['s', 'chest-1'],
      ])
    })

    await it('stays out of the way of a scalar type', async () => {
      expect(tupleMembersFor('s', 'kokiri-forest')).toBe(null)
      expect(tupleMembersFor(null, 3)).toBe(null)
    })

    await it('throws unless the value is an array of the tuple arity', async () => {
      // `win.focus-placement` is `(ss)`: one id short is an activation
      // GTK drops, i.e. a deep link that opens nothing.
      expect(() => tupleMembersFor('(ss)', ['kokiri-forest'])).toThrow(/array of 2 value\(s\)/)
      expect(() => tupleMembersFor('(ss)', 'kokiri-forest')).toThrow(/array of 2 value\(s\)/)
      expect(() => tupleMembersFor('(ss)', ['a', 'b', 'c'])).toThrow(/array of 2 value\(s\)/)
    })
  })
}
