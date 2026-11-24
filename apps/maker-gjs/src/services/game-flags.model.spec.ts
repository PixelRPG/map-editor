import { describe, expect, it } from '@gjsify/unit'
import type { GameProjectData, MapData } from '@pixelrpg/engine'

import { buildFlagRows } from './game-flags.model.ts'

const project = {
  flags: [
    { id: 'key', name: 'Has key', kind: 'yes-no' },
    { id: 'idle', name: 'Idle', kind: 'yes-no' },
  ],
  entityLibrary: [
    {
      id: 'door',
      name: 'Door',
      components: [
        {
          type: 'actions',
          actions: [{ id: 'a', type: 'set-flag', flag: 'key', value: true }],
        },
      ],
      states: [{ id: 's', when: { flag: 'ghost' }, components: [] }],
    },
    {
      id: 'hero',
      name: 'Hero',
      components: [],
      states: [{ id: 's', when: { flag: 'key' }, components: [] }],
    },
  ],
} as unknown as GameProjectData

const maps = [
  {
    id: 'm',
    name: 'Forest',
    objectPlacements: [
      {
        id: 'p1',
        defId: 'door',
        overrides: {
          name: 'Front door',
          components: [
            {
              type: 'actions',
              actions: [{ id: 'b', type: 'set-flag', flag: 'key', value: true }],
            },
          ],
        },
      },
    ],
  },
] as unknown as MapData[]

export default async () => {
  await describe('buildFlagRows', async () => {
    await it('keeps named flags first and appends unnamed used ids', async () => {
      const rows = buildFlagRows({ project, maps, characterIds: ['hero'] })
      expect(rows.map((r) => r.id)).toStrictEqual(['key', 'idle', 'ghost'])
    })

    await it('leaves an unused flag with no usages', async () => {
      const rows = buildFlagRows({ project, maps, characterIds: ['hero'] })
      expect(rows[1].usages.length).toBe(0)
    })

    await it('names placements by override and links by kind', async () => {
      const key = buildFlagRows({ project, maps, characterIds: ['hero'] })[0].usages
      const placed = key.find((u) => u.access === 'write' && u.mapName === 'Forest')!
      expect(placed.thingName).toBe('Front door')
      expect(placed.link).toStrictEqual({
        action: 'win.focus-placement',
        target: ['m', 'p1'],
      })
      const lib = key.find((u) => u.thingName === 'Hero')!
      expect(lib.access).toBe('read')
      expect(lib.link).toStrictEqual({
        action: 'win.open-character',
        target: 'hero',
      })
      const obj = buildFlagRows({
        project,
        maps: [],
        characterIds: ['hero'],
      })[0].usages.find((u) => u.thingName === 'Door')!
      expect(obj.link).toStrictEqual({
        action: 'win.open-object',
        target: 'door',
      })
    })
  })
}
