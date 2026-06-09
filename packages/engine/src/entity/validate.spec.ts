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

export default async () => {
  await describe('validateComponentData', async () => {
    await it('accepts valid data', async () => {
      expect(validateComponentData(speedSpec, { type: 'movement', tilesPerSec: 4 })).toStrictEqual([])
    })
    await it('flags a missing required field', async () => {
      expect(validateComponentData(speedSpec, { type: 'movement' }).length).toBe(1)
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
    await it('validates component data through the registry', async () => {
      const def: EntityDefinition = { id: 'x', name: 'X', components: [{ type: 'movement' }] }
      expect(validateEntityDefinition(def, registry).length).toBe(1)
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
