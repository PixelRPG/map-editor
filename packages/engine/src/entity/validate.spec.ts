import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition } from '../types/data/index.ts'
import type { ComponentSpec } from './component-spec.ts'
import { validateComponentData, validateEntityDefinition } from './validate.ts'

const speedSpec: ComponentSpec = {
  type: 'movement',
  editor: { label: 'Movement', icon: 'x' },
  fields: [{ key: 'tilesPerSec', label: 'Speed', input: 'int', required: true, min: 1, max: 16 }],
  build: () => null,
}

const selectSpec: ComponentSpec = {
  type: 'trigger',
  editor: { label: 'Trigger', icon: 'x' },
  fields: [
    { key: 'on', label: 'On', input: 'select', required: true, options: [{ value: 'auto', label: 'Auto' }] },
    { key: 'facing', label: 'Facing', input: 'facing' },
  ],
  build: () => null,
}

// A mis-declared select: closed ComboRow in the UI, but no options to
// validate against — must be rejected rather than accept any string.
const brokenSelectSpec: ComponentSpec = {
  type: 'state',
  editor: { label: 'State', icon: 'x' },
  fields: [{ key: 'value', label: 'Value', input: 'select' }],
  build: () => null,
}

const jsonSpec: ComponentSpec = {
  type: 'custom-data',
  editor: { label: 'Custom', icon: 'x' },
  fields: [{ key: 'data', label: 'Data', input: 'json' }],
  build: () => null,
}

export default async () => {
  await describe('validateComponentData', async () => {
    await it('accepts valid data', async () => {
      expect(validateComponentData(speedSpec, { type: 'movement', tilesPerSec: 4 })).toStrictEqual([])
    })
    await it('only flags a missing required field when requireComplete', async () => {
      // Lenient (save / draft) — an empty required field is allowed.
      expect(validateComponentData(speedSpec, { type: 'movement' })).toStrictEqual([])
      // Strict (spawn / publish) — required is enforced.
      expect(validateComponentData(speedSpec, { type: 'movement' }, true).length).toBe(1)
    })
    await it('enforces numeric range', async () => {
      expect(validateComponentData(speedSpec, { type: 'movement', tilesPerSec: 99 }).length).toBe(1)
      expect(validateComponentData(speedSpec, { type: 'movement', tilesPerSec: 1.5 }).length).toBe(1) // not integer
    })
    await it('enforces select options + facing values', async () => {
      expect(validateComponentData(selectSpec, { type: 'trigger', on: 'auto' })).toStrictEqual([])
      expect(validateComponentData(selectSpec, { type: 'trigger', on: 'nope' }).length).toBe(1)
      expect(validateComponentData(selectSpec, { type: 'trigger', on: 'auto', facing: 'sideways' }).length).toBe(1)
      expect(validateComponentData(selectSpec, { type: 'trigger', on: 'auto', facing: 'up' })).toStrictEqual([])
    })
    await it('rejects a select field declared without options', async () => {
      const errors = validateComponentData(brokenSelectSpec, { type: 'state', value: 'whatever' })
      expect(errors.some((e) => e.includes('select field has no options'))).toBe(true)
    })
    await it('accepts JSON-serialisable data but rejects non-serialisable shapes', async () => {
      expect(validateComponentData(jsonSpec, { type: 'custom-data', data: { a: 1, b: [2, 3] } })).toStrictEqual([])
      // Circular reference — JSON.stringify throws.
      const circular: Record<string, unknown> = {}
      circular.self = circular
      expect(validateComponentData(jsonSpec, { type: 'custom-data', data: circular }).length).toBe(1)
      // BigInt + Map are not JSON-serialisable.
      expect(validateComponentData(jsonSpec, { type: 'custom-data', data: 10n as unknown }).length).toBe(1)
      expect(validateComponentData(jsonSpec, { type: 'custom-data', data: new Map() }).length).toBe(1)
    })
  })

  await describe('validateEntityDefinition', async () => {
    const registry = { movement: speedSpec }
    await it('passes a valid definition', async () => {
      const def: EntityDefinition = { id: 'hero', name: 'Hero', components: [{ type: 'movement', tilesPerSec: 4 }] }
      expect(validateEntityDefinition(def, registry)).toStrictEqual([])
    })
    await it('rejects an unregistered component type loudly', async () => {
      const def: EntityDefinition = { id: 'x', name: 'X', components: [{ type: 'teleport', targetMapId: 'm' }] }
      const errors = validateEntityDefinition(def, registry)
      expect(errors.some((e) => e.includes('unregistered component type "teleport"'))).toBe(true)
    })
    await it('rejects a duplicate component type within one list', async () => {
      // getComponentData returns the FIRST match, so a second component of
      // the same type is silently ignored at spawn — validation must catch it.
      const def: EntityDefinition = {
        id: 'hero',
        name: 'Hero',
        components: [
          { type: 'movement', tilesPerSec: 4 },
          { type: 'movement', tilesPerSec: 8 },
        ],
      }
      expect(
        validateEntityDefinition(def, registry).some((e) => e.includes('duplicate component type "movement"')),
      ).toBe(true)
    })
    await it('flags wrong field types always, but required only when requireComplete', async () => {
      // Wrong TYPE is always rejected (even on the lenient save path).
      const wrongType: EntityDefinition = {
        id: 'x',
        name: 'X',
        components: [{ type: 'movement', tilesPerSec: 'fast' }],
      }
      expect(validateEntityDefinition(wrongType, registry).length).toBe(1)
      // Empty required field: a draft saves clean, the strict gate flags it.
      const draft: EntityDefinition = { id: 'x', name: 'X', components: [{ type: 'movement' }] }
      expect(validateEntityDefinition(draft, registry)).toStrictEqual([])
      expect(validateEntityDefinition(draft, registry, true).length).toBe(1)
    })
    await it('validates state-overlay components too', async () => {
      const def: EntityDefinition = {
        id: 'door',
        name: 'Door',
        components: [{ type: 'movement', tilesPerSec: 4 }],
        states: [{ id: 'open', components: [{ type: 'bogus' }] }],
      }
      expect(validateEntityDefinition(def, registry).some((e) => e.includes('state "open"'))).toBe(true)
    })
  })
}
