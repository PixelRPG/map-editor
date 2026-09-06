import { describe, expect, it } from '@gjsify/unit'
import { BUILT_IN_GAME_SYSTEMS } from '../game-systems/registry.ts'
import type { EntityDefinition, MapData } from '../types/data/index.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import {
  definitionHasSimpleViewHiddenContent,
  hiddenSettingsCount,
  hiddenSettingsInComponent,
  isSetOffDefault,
  isSimpleViewComponent,
  projectHasSimpleViewHiddenContent,
  simpleViewFields,
  simpleViewRegistry,
} from './disclosure.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'

/** The documented split of the built-in specs — the concept doc's table, pinned. */
const SIMPLE_VIEW_TYPES = [
  'actions',
  'collision',
  'dialogue',
  'hostile',
  'hurtbox',
  'invulnerable',
  'item',
  'movement',
  'spawn-point',
  'stats',
  'teleport',
  'trigger',
  'visual',
  'weapon',
]
const FULL_VIEW_ONLY_TYPES = ['custom-data', 'npc-route', 'script']

const registry = BUILT_IN_COMPONENT_SPECS

/** The Full-view-only trigger fields, set off their defaults: `once` + `scriptId`. */
const triggerWithTwoHidden = { type: 'trigger', on: 'action-button', once: true, scriptId: 'door-check' }

export default async () => {
  await describe('disclosure — the built-in split', async () => {
    await it('divides the built-in specs into exactly the documented Simple / Full-only sets', async () => {
      const simple = Object.keys(simpleViewRegistry(registry)).sort()
      const fullOnly = Object.values(registry)
        .filter((spec) => !isSimpleViewComponent(spec))
        .map((spec) => spec.type)
        .sort()
      expect(simple).toStrictEqual(SIMPLE_VIEW_TYPES)
      expect(fullOnly).toStrictEqual(FULL_VIEW_ONLY_TYPES)
    })

    await it('keeps the component flag and the field flags consistent on every spec', async () => {
      // A basic field inside a non-basic component would be a row nobody
      // can reach; a basic component with fields but no basic field would
      // render as an empty group. Either is a spec-data mistake.
      for (const spec of Object.values(registry)) {
        const basicFields = simpleViewFields(spec)
        if (isSimpleViewComponent(spec) && spec.fields.length > 0) {
          expect(basicFields.length > 0).toBe(true)
        }
        if (basicFields.length > 0) {
          expect(isSimpleViewComponent(spec)).toBe(true)
        }
      }
    })

    await it('lets every game-system template be built without leaving Simple view', async () => {
      // The templates are what a child's game is made of; a template that
      // seeds a hidden component would show a wall on its first object.
      for (const system of Object.values(BUILT_IN_GAME_SYSTEMS)) {
        for (const template of system.templates ?? []) {
          for (const component of template.components) {
            const spec = registry[component.type]
            expect(spec !== undefined).toBe(true)
            if (spec) expect(isSimpleViewComponent(spec)).toBe(true)
          }
          expect(hiddenSettingsCount({ components: [...template.components] }, registry)).toBe(0)
        }
      }
    })
  })

  await describe('disclosure — N is exact', async () => {
    await it('counts k hidden components plus m set, off-default hidden fields', async () => {
      const def: EntityDefinition = {
        id: 'door',
        name: 'Door',
        components: [
          { type: 'visual', spriteSetId: 'props', spriteId: 3 },
          triggerWithTwoHidden, // m += 2
          { type: 'teleport', targetMapId: 'cave', targetTileX: 1, targetTileY: 1, facing: 'up' }, // m += 1
          { type: 'script', scriptId: 'door-logic' }, // k += 1
          { type: 'custom-data', data: { hp: 3 } }, // k += 1
        ],
      }
      expect(hiddenSettingsCount(def, registry)).toBe(5)
    })

    await it('counts nothing for basic-only data, defaults, unset and empty values', async () => {
      const def: EntityDefinition = {
        id: 'apple',
        name: 'Apple',
        components: [
          { type: 'visual', spriteSetId: 'items', spriteId: 4, animationId: undefined },
          { type: 'item', itemId: 'apple', qty: 1, pickupSound: '' },
          { type: 'trigger', on: 'walk-onto', scriptId: null },
          { type: 'actions', actions: [] },
        ],
      }
      expect(hiddenSettingsCount(def, registry)).toBe(0)
    })

    await it('counts one per hidden component regardless of its data', async () => {
      const script = registry.script
      expect(hiddenSettingsInComponent(script, { type: 'script' })).toBe(1)
      expect(hiddenSettingsInComponent(script, { type: 'script', scriptId: 'a', params: { x: 1 } })).toBe(1)
    })

    await it('ignores unknown and dormant types and the host-excluded ones', async () => {
      const def: EntityDefinition = {
        id: 'x',
        name: 'X',
        components: [{ type: 'no-such-thing', foo: 1 }, triggerWithTwoHidden, { type: 'script', scriptId: 's' }],
      }
      // `script` absent from the registry → dormant/unknown → not counted.
      const withoutScript: ComponentSpecRegistry = Object.fromEntries(
        Object.entries(registry).filter(([type]) => type !== 'script'),
      )
      expect(hiddenSettingsCount(def, withoutScript)).toBe(2)
      expect(hiddenSettingsCount(def, registry, ['trigger'])).toBe(1)
    })

    await it('compares json-shaped values by content and primitives by value', async () => {
      expect(isSetOffDefault({ default: [] }, [])).toBe(false)
      expect(isSetOffDefault({ default: [] }, [{ id: 'a' }])).toBe(true)
      expect(isSetOffDefault({ default: 1 }, 1)).toBe(false)
      expect(isSetOffDefault({ default: 1 }, 2)).toBe(true)
      expect(isSetOffDefault({}, false)).toBe(true)
      expect(isSetOffDefault({}, undefined)).toBe(false)
      expect(isSetOffDefault({}, '')).toBe(false)
    })
  })

  await describe('disclosure — hidden content (the banner condition)', async () => {
    const plain: EntityDefinition = {
      id: 'sign',
      name: 'Sign',
      components: [
        { type: 'trigger', on: 'action-button' },
        { type: 'actions', actions: [] },
      ],
    }
    const scripted: EntityDefinition = { id: 'npc', name: 'NPC', components: [{ type: 'script', scriptId: 'talk' }] }
    const stateful: EntityDefinition = {
      id: 'door',
      name: 'Door',
      components: [{ type: 'trigger', on: 'action-button' }],
      states: [{ id: 'open', when: { flag: 'has-key' }, components: [{ type: 'actions', actions: [] }] }],
    }

    await it('flags a hidden component or a states[] overlay, and nothing else', async () => {
      expect(definitionHasSimpleViewHiddenContent(plain, registry)).toBe(false)
      expect(definitionHasSimpleViewHiddenContent(scripted, registry)).toBe(true)
      expect(definitionHasSimpleViewHiddenContent(stateful, registry)).toBe(true)
      // A hidden field set off its default is the count row's business,
      // not the banner's.
      expect(definitionHasSimpleViewHiddenContent({ components: [triggerWithTwoHidden] }, registry)).toBe(false)
    })

    await it('scans the library, inline placements and placement overrides', async () => {
      const noMaps: Pick<MapData, 'objectPlacements'>[] = []
      expect(projectHasSimpleViewHiddenContent({ entityLibrary: [plain] }, noMaps, registry)).toBe(false)
      expect(projectHasSimpleViewHiddenContent({ entityLibrary: [plain, scripted] }, noMaps, registry)).toBe(true)
      expect(projectHasSimpleViewHiddenContent(null, noMaps, registry)).toBe(false)

      const inlineMap: Pick<MapData, 'objectPlacements'> = {
        objectPlacements: [{ id: 'p1', layerId: 'l', tileX: 0, tileY: 0, inline: stateful }],
      }
      expect(projectHasSimpleViewHiddenContent({ entityLibrary: [] }, [inlineMap], registry)).toBe(true)

      const overrideMap: Pick<MapData, 'objectPlacements'> = {
        objectPlacements: [
          {
            id: 'p2',
            layerId: 'l',
            tileX: 0,
            tileY: 0,
            defId: 'sign',
            overrides: { components: [{ type: 'custom-data', data: {} }] },
          },
        ],
      }
      expect(projectHasSimpleViewHiddenContent({ entityLibrary: [plain] }, [overrideMap], registry)).toBe(true)
    })
  })
}
