import { describe, expect, it } from '@gjsify/unit'

import blankStarter from '../../../../games/blank-starter/game-project.json' with { type: 'json' }
import zeldaLike from '../../../../games/zelda-like/game-project.json' with { type: 'json' }
import blankScene from '../../../../games/blank-starter/maps/blank-scene.json' with { type: 'json' }
import kokiri from '../../../../games/zelda-like/maps/kokiri-forest.json' with { type: 'json' }
import treeHouse from '../../../../games/zelda-like/maps/tree-house.json' with { type: 'json' }
import treeHouseCozy from '../../../../games/zelda-like/maps/tree-house-cozy.json' with { type: 'json' }
import type { GameProjectData, MapData } from '../types'
import { findFlagUsages } from './flag-usages'

const setFlag = (flag: string) => ({
  type: 'actions',
  actions: [{ id: 'a', type: 'set-flag', flag, value: true }],
})

function project(): GameProjectData {
  return {
    entityLibrary: [
      {
        id: 'door',
        name: 'Door',
        components: [
          setFlag('key'),
          {
            type: 'actions',
            actions: [{ id: 'c', type: 'change-counter', flag: 'coins', amount: 1 }],
          },
        ],
        states: [
          { id: 'open', when: { flag: 'key' }, components: [] },
          {
            id: 'locked',
            when: {
              type: 'all',
              of: [
                { type: 'counter', flag: 'coins', op: '>', value: 2 },
                { flag: 'key', equals: false },
              ],
            },
            components: [],
          },
          {
            id: 'never',
            when: { type: 'not', of: { type: 'flag-is', flag: 'moon' } },
            components: [],
          },
        ],
      },
    ],
  } as unknown as GameProjectData
}

const map = {
  id: 'm',
  objectPlacements: [
    {
      id: 'sign',
      defId: 'door',
      overrides: {
        components: [
          {
            type: 'actions',
            actions: [
              { id: 'x', type: 'show-text', text: 'hi' },
              {
                id: 'y',
                type: 'ask',
                prompt: 'q',
                options: [
                  {
                    id: 'o',
                    label: 'a',
                    actions: [{ id: 'z', type: 'set-flag', flag: 'mood', value: 'x' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: 'chest',
      inline: {
        id: 'chest-def',
        name: 'C',
        components: [],
        states: [
          {
            id: 's',
            when: { type: 'any', of: [{ flag: 'moon' }] },
            components: [],
          },
        ],
      },
    },
  ],
} as unknown as MapData

export default async () => {
  await describe('findFlagUsages', async () => {
    await it('reads shorthand, nested conditions and writes from the library', async () => {
      const usages = findFlagUsages(project(), [])
      expect(usages.get('key')!.map((u) => [u.access, u.via, u.stateIndex, u.actionIndex])).toStrictEqual([
        ['write', 'set-flag', null, 0],
        ['read', 'condition', 0, null],
        ['read', 'condition', 1, null],
      ])
      expect(usages.get('coins')!.map((u) => [u.access, u.via, u.stateIndex, u.actionIndex])).toStrictEqual([
        ['write', 'change-counter', null, 0],
        ['read', 'condition', 1, null],
      ])
      expect(usages.get('moon')!.map((u) => u.stateIndex)).toStrictEqual([2])
      expect(usages.get('door')).toBe(undefined)
      expect(usages.get('key')![0]).toMatchObject({
        mapId: null,
        placementId: null,
        entityId: 'door',
      })
    })

    await it('carries map and placement ids, nested ask answers and inline definitions', async () => {
      const usages = findFlagUsages(project(), [map])
      expect(usages.get('mood')).toStrictEqual([
        {
          flagId: 'mood',
          access: 'write',
          via: 'set-flag',
          mapId: 'm',
          placementId: 'sign',
          entityId: 'door',
          stateIndex: null,
          actionIndex: 1,
        },
      ])
      const moon = usages.get('moon')!.filter((u) => u.mapId === 'm')
      expect(moon).toStrictEqual([
        {
          flagId: 'moon',
          access: 'read',
          via: 'condition',
          mapId: 'm',
          placementId: 'chest',
          entityId: 'chest-def',
          stateIndex: 0,
          actionIndex: null,
        },
      ])
    })

    await it('finds nothing in the shipped games, which name no flags', async () => {
      expect(
        findFlagUsages(
          zeldaLike as unknown as GameProjectData,
          [kokiri, treeHouse, treeHouseCozy] as unknown as MapData[],
        ).size,
      ).toBe(0)
      expect(
        findFlagUsages(blankStarter as unknown as GameProjectData, [blankScene] as unknown as MapData[]).size,
      ).toBe(0)
    })
  })
}
