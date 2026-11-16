import { describe, expect, it } from '@gjsify/unit'
import type { ComponentData, FieldDescriptor, FieldInput } from '@pixelrpg/engine'
import {
  defaultComponentData,
  overlayRenderedFields,
  rowKindFor,
  SPIN_UPPER_DEFAULT,
  spinGeometryFor,
  spinValueFor,
  TOGGLE_GROUP_MAX_OPTIONS,
} from './component-inspector.model.ts'

const field = (input: FieldInput, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  key: 'f',
  label: 'F',
  input,
  ...extra,
})

const options = (count: number) => Array.from({ length: count }, (_unused, i) => ({ value: `v${i}`, label: `L${i}` }))

export default async () => {
  await describe('defaultComponentData', async () => {
    await it('keeps the type and every field that names a default', async () => {
      const out = defaultComponentData({
        type: 'movement',
        fields: [
          field('int', { key: 'tilesPerSec', default: 4 }),
          field('bool', { key: 'canRun', default: false }),
          field('text', { key: 'gait', default: '' }),
        ],
      })
      expect(out).toStrictEqual({ type: 'movement', tilesPerSec: 4, canRun: false, gait: '' })
    })

    await it('omits a field with no default instead of nulling it', async () => {
      const out = defaultComponentData({
        type: 'teleport',
        fields: [field('map-ref', { key: 'targetMapId' }), field('int', { key: 'targetTileX', default: 0 })],
      })
      expect(out).toStrictEqual({ type: 'teleport', targetTileX: 0 })
      expect('targetMapId' in out).toBe(false)
    })

    await it('is just the type for a component with no editable fields', async () => {
      expect(defaultComponentData({ type: 'solid', fields: [] })).toStrictEqual({ type: 'solid' })
    })
  })

  await describe('rowKindFor', async () => {
    await it('maps each simple input to the row § 4.4 names for it', async () => {
      expect(rowKindFor(field('bool'), 0)).toBe('switch')
      expect(rowKindFor(field('int'), 0)).toBe('spin')
      expect(rowKindFor(field('float'), 0)).toBe('spin')
      expect(rowKindFor(field('text'), 0)).toBe('entry')
      expect(rowKindFor(field('json'), 0)).toBe('json')
    })

    await it('gives every reference input a reference row', async () => {
      for (const input of ['map-ref', 'appearance-ref', 'sprite-ref'] as const) {
        expect(rowKindFor(field(input), 12)).toBe('reference')
      }
    })

    await it('keeps a reference row even when the project resolved no targets', async () => {
      // A project with no maps yet must still show the row (and its empty
      // picker), not silently fall through to a combo of nothing.
      expect(rowKindFor(field('map-ref'), 0)).toBe('reference')
    })

    await it('renders a short enum inline and a long one as a combo', async () => {
      const enumField = (count: number) => field('select', { options: options(count) })
      expect(rowKindFor(enumField(2), 2)).toBe('toggle-group')
      expect(rowKindFor(enumField(TOGGLE_GROUP_MAX_OPTIONS), TOGGLE_GROUP_MAX_OPTIONS)).toBe('toggle-group')
      expect(rowKindFor(enumField(TOGGLE_GROUP_MAX_OPTIONS + 1), TOGGLE_GROUP_MAX_OPTIONS + 1)).toBe('combo')
    })

    await it('renders facing inline — its four directions are the toggle-group case', async () => {
      expect(rowKindFor(field('facing'), 4)).toBe('toggle-group')
    })

    await it('falls back to a combo for an enum whose options are missing', async () => {
      // Zero choices would make an empty ToggleGroup, which has no way to
      // show the value it holds; a ComboRow at least renders as unset.
      expect(rowKindFor(field('select'), 0)).toBe('combo')
    })
  })

  await describe('spinGeometryFor', async () => {
    await it('takes the spec bounds and steps whole numbers for an int', async () => {
      expect(spinGeometryFor(field('int', { min: 1, max: 9, step: 2 }))).toStrictEqual({
        lower: 1,
        upper: 9,
        step: 2,
        digits: 0,
      })
    })

    await it('gives a float two decimals and a half step by default', async () => {
      expect(spinGeometryFor(field('float'))).toStrictEqual({
        lower: 0,
        upper: SPIN_UPPER_DEFAULT,
        step: 0.5,
        digits: 2,
      })
    })
  })

  await describe('spinValueFor', async () => {
    await it('shows the default, not the minimum, for an untouched field', async () => {
      // The regression: a `min: 0, default: 64` speed read as 0 — "cannot
      // move" — for every entity nobody had edited.
      const speed = field('int', { min: 0, max: 512, default: 64 })
      expect(spinValueFor(speed, undefined)).toBe(64)
      expect(spinValueFor(speed, null)).toBe(64)
      expect(spinValueFor(speed, 'fast')).toBe(64)
    })

    await it('falls back to the minimum only when the spec names no default', async () => {
      expect(spinValueFor(field('int', { min: 3 }), undefined)).toBe(3)
      expect(spinValueFor(field('int'), undefined)).toBe(0)
    })

    await it('passes a real value through', async () => {
      expect(spinValueFor(field('float', { min: 0, max: 10 }), 2.5)).toBe(2.5)
    })

    await it('clamps a stored value outside the bounds', async () => {
      const f = field('int', { min: 1, max: 8, default: 4 })
      expect(spinValueFor(f, 99)).toBe(8)
      expect(spinValueFor(f, -5)).toBe(1)
    })

    await it('rounds for an int and keeps the fraction for a float', async () => {
      expect(spinValueFor(field('int', { max: 10 }), 2.6)).toBe(3)
      expect(spinValueFor(field('float', { max: 10 }), 2.6)).toBe(2.6)
    })

    await it('rejects NaN and Infinity in favour of the default', async () => {
      const f = field('float', { min: 0, max: 10, default: 1 })
      expect(spinValueFor(f, Number.NaN)).toBe(1)
      expect(spinValueFor(f, Number.POSITIVE_INFINITY)).toBe(1)
    })
  })

  await describe('overlayRenderedFields', async () => {
    await it('keeps every field no row renders (the Simple-view data-loss case)', async () => {
      // A trigger whose `once` + `scriptId` rows are filtered out; only
      // `on` is on screen and gets edited.
      const base: ComponentData = { type: 'trigger', on: 'walk-onto', once: true, scriptId: 'door-check' }
      const out = overlayRenderedFields('trigger', base, [{ key: 'on', value: 'action-button' }])
      expect(out).toStrictEqual({ type: 'trigger', on: 'action-button', once: true, scriptId: 'door-check' })
    })

    await it('overlays every rendered row onto the base', async () => {
      const base: ComponentData = { type: 'teleport', targetMapId: 'a', targetTileX: 1, targetTileY: 2 }
      const out = overlayRenderedFields('teleport', base, [
        { key: 'targetMapId', value: 'b' },
        { key: 'targetTileX', value: 7 },
      ])
      expect(out).toStrictEqual({ type: 'teleport', targetMapId: 'b', targetTileX: 7, targetTileY: 2 })
    })

    await it('removes a key whose rendered row reports undefined (an emptied entry)', async () => {
      const base: ComponentData = { type: 'item', itemId: 'key', pickupSound: 'chime' }
      const out = overlayRenderedFields('item', base, [{ key: 'pickupSound', value: undefined }])
      expect(out).toStrictEqual({ type: 'item', itemId: 'key' })
      expect('pickupSound' in out).toBe(false)
    })

    await it('carries keys the spec does not describe through untouched', async () => {
      // A newer editor may have written a field this build has no
      // descriptor for; editing an unrelated row must not strip it.
      const base: ComponentData = { type: 'visual', spriteSetId: 'hero', futureKey: { nested: [1, 2] } }
      const out = overlayRenderedFields('visual', base, [{ key: 'spriteSetId', value: 'villain' }])
      expect(out.futureKey).toStrictEqual({ nested: [1, 2] })
      expect(out.spriteSetId).toBe('villain')
    })

    await it('builds from the rows alone when no payload was set yet', async () => {
      const out = overlayRenderedFields('movement', null, [{ key: 'tilesPerSec', value: 4 }])
      expect(out).toStrictEqual({ type: 'movement', tilesPerSec: 4 })
    })

    await it('always stamps the type the spec names and never mutates the base', async () => {
      const base: ComponentData = { type: 'stale', foo: 1 }
      const out = overlayRenderedFields('fresh', base, [{ key: 'foo', value: 2 }])
      expect(out.type).toBe('fresh')
      expect(base).toStrictEqual({ type: 'stale', foo: 1 })
    })
  })
}
