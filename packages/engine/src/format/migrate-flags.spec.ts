import { describe, expect, it } from '@gjsify/unit'

import blankStarter from '../../../../games/blank-starter/game-project.json' with { type: 'json' }
import zeldaLike from '../../../../games/zelda-like/game-project.json' with { type: 'json' }
import blankScene from '../../../../games/blank-starter/maps/blank-scene.json' with { type: 'json' }
import kokiri from '../../../../games/zelda-like/maps/kokiri-forest.json' with { type: 'json' }
import treeHouse from '../../../../games/zelda-like/maps/tree-house.json' with { type: 'json' }
import treeHouseCozy from '../../../../games/zelda-like/maps/tree-house-cozy.json' with { type: 'json' }
import { initialFlagValues } from '../components/game-save-state.component'
import type { GameProjectData, MapData } from '../types'
import { flagIdFromName } from '../types'
import { GameProjectFormat } from './GameProjectFormat'
import { findFlagUsage, migrateMapFlags, migrateProjectFlags } from './migrate-flags'

/** A project as an older editor wrote it: flags are the free text a author typed. */
function oldProject(): GameProjectData {
  return {
    version: '1.0.0',
    id: 'p',
    name: 'P',
    startup: { initialMapId: 'm', initialX: 0, initialY: 0, initialDirection: 'down' },
    maps: [{ id: 'm', name: 'M', path: './m.json', type: 'map' }],
    spriteSets: [],
    entityLibrary: [
      {
        id: 'door',
        name: 'Door',
        components: [{ type: 'actions', actions: [{ id: 'a1', type: 'set-flag', flag: 'Has Key', value: true }] }],
        states: [{ id: 'open', when: { flag: 'Has Key' }, components: [] }],
      },
    ],
  } as unknown as GameProjectData
}

/** A map whose placements carry names: one inline definition, one override with a nested answer. */
function oldMap(): MapData {
  return {
    id: 'm',
    name: 'M',
    version: '1.0.0',
    objectPlacements: [
      {
        id: 'chest',
        layerId: 'l',
        tileX: 1,
        tileY: 1,
        inline: {
          id: 'chest-def',
          name: 'Chest',
          components: [{ type: 'actions', actions: [{ id: 'a', type: 'set-flag', flag: 'Coins', value: 3 }] }],
          states: [{ id: 's', when: { flag: 'Has Key', equals: true }, components: [] }],
        },
      },
      {
        id: 'sign',
        layerId: 'l',
        tileX: 2,
        tileY: 2,
        defId: 'door',
        overrides: {
          components: [
            {
              type: 'actions',
              actions: [
                {
                  id: 'q',
                  type: 'ask',
                  prompt: 'Ok?',
                  options: [
                    { id: 'y', label: 'Yes', actions: [{ id: 'b', type: 'set-flag', flag: 'Mood', value: 'happy' }] },
                    { id: 'n', label: 'No', actions: [] },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  } as unknown as MapData
}

export default async () => {
  await describe('migrateProjectFlags', async () => {
    await it('turns names in the library into ids and creates the entries', async () => {
      const project = migrateProjectFlags(oldProject())
      const id = flagIdFromName('Has Key')
      expect(project.flags).toStrictEqual([{ id, name: 'Has Key', kind: 'yes-no', initial: false, scope: 'game' }])
      const def = project.entityLibrary![0]
      expect((def.components[0] as unknown as { actions: { flag: string }[] }).actions[0].flag).toBe(id)
      expect(def.states![0].when).toStrictEqual({ flag: id })
    })

    await it('is idempotent and the result validates', async () => {
      const once = migrateProjectFlags(oldProject())
      const snapshot = JSON.stringify(once)
      expect(JSON.stringify(migrateProjectFlags(once))).toBe(snapshot)
      expect(GameProjectFormat.validate(once)).toBe(true)
    })

    await it('keeps a flag that already exists as it is', async () => {
      const project = oldProject()
      const id = flagIdFromName('Has Key')
      project.flags = [{ id, name: 'Key', kind: 'yes-no', initial: true, scope: 'thing' }]
      migrateProjectFlags(project)
      expect(project.flags).toStrictEqual([{ id, name: 'Key', kind: 'yes-no', initial: true, scope: 'thing' }])
    })
  })

  await describe('migrateMapFlags', async () => {
    await it('rewrites inline definitions and overrides (nested answers too) and infers kinds', async () => {
      const project = migrateProjectFlags(oldProject())
      const map = oldMap()
      expect(migrateMapFlags(project, map)).toBe(true)
      const byName = new Map(project.flags!.map((f) => [f.name, f]))
      expect(byName.get('Coins')).toStrictEqual({
        id: flagIdFromName('Coins'),
        name: 'Coins',
        kind: 'number',
        initial: 0,
        scope: 'game',
      })
      expect(byName.get('Mood')?.kind).toBe('text')
      expect(byName.get('Mood')?.initial).toBe('')
      // "Has Key" is shared between library and map: one entry, not two.
      expect(project.flags!.filter((f) => f.name === 'Has Key')).toHaveLength(1)

      const inline = map.objectPlacements![0].inline!
      expect((inline.components[0] as unknown as { actions: { flag: string }[] }).actions[0].flag).toBe(
        flagIdFromName('Coins'),
      )
      expect(inline.states![0].when).toStrictEqual({ flag: flagIdFromName('Has Key'), equals: true })
      const ask = (
        map.objectPlacements![1].overrides!.components![0] as unknown as {
          actions: { options: { actions: { flag: string }[] }[] }[]
        }
      ).actions[0]
      expect(ask.options[0].actions[0].flag).toBe(flagIdFromName('Mood'))
    })

    await it('is idempotent and reports nothing to do the second time', async () => {
      const project = migrateProjectFlags(oldProject())
      const map = oldMap()
      migrateMapFlags(project, map)
      const after = JSON.stringify([project, map])
      expect(migrateMapFlags(project, map)).toBe(false)
      expect(JSON.stringify([project, map])).toBe(after)
    })

    await it('finds where a flag is used', async () => {
      const project = migrateProjectFlags(oldProject())
      const map = oldMap()
      migrateMapFlags(project, map)
      const usage = findFlagUsage(project, [map], flagIdFromName('Has Key'))
      expect(usage).toStrictEqual([
        { where: 'entity', id: 'door' },
        { where: 'map', id: 'm' },
      ])
      expect(findFlagUsage(project, [map], 'nope')).toStrictEqual([])
    })
  })

  await describe('shipped games', async () => {
    await it('name no flags, so migrating them changes nothing', async () => {
      for (const [project, maps] of [
        [blankStarter, [blankScene]],
        [zeldaLike, [kokiri, treeHouse, treeHouseCozy]],
      ] as const) {
        const data = JSON.parse(JSON.stringify(project)) as GameProjectData
        const before = JSON.stringify(data)
        migrateProjectFlags(data)
        for (const map of maps) {
          const copy = JSON.parse(JSON.stringify(map)) as MapData
          expect(migrateMapFlags(data, copy)).toBe(false)
          expect(JSON.stringify(copy)).toBe(JSON.stringify(map))
        }
        expect(JSON.stringify(data)).toBe(before)
        expect(data.flags).toBeUndefined()
      }
    })
  })

  await describe('initialFlagValues', async () => {
    await it('starts every flag from its initial value, by id', async () => {
      expect(
        initialFlagValues([
          { id: 'a', name: 'A', kind: 'yes-no', initial: false, scope: 'game' },
          { id: 'b', name: 'B', kind: 'number', initial: 5, scope: 'thing' },
        ]),
      ).toStrictEqual({ a: false, b: 5 })
      expect(initialFlagValues(undefined)).toStrictEqual({})
    })
  })
}
