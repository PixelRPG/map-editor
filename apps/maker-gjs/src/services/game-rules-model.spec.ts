import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition, GameSystemSpec, MapData } from '@pixelrpg/engine'
import { buildGameRulesModel } from './game-rules-model.ts'

function system(id: string, label: string, opts: Partial<GameSystemSpec> = {}): GameSystemSpec {
  return {
    id,
    editor: { label, kidLabel: `${label} for kids`, icon: 'x-symbolic' },
    components: [],
    runtime: () => [],
    ...opts,
  }
}

/** A component spec stub — only `type` is read by the usage counter. */
function componentOf(type: string): GameSystemSpec['components'][number] {
  return { type, system: 'fixture', editor: { label: type, icon: 'x' }, fields: [], build: () => null }
}

const entity = (id: string, types: string[]): EntityDefinition => ({
  id,
  name: id,
  components: types.map((type) => ({ type })),
})

const map = (defIds: string[]): Pick<MapData, 'objectPlacements'> => ({
  objectPlacements: defIds.map((defId, i) => ({ id: `p${i}`, defId, layerId: 'l', tileX: 0, tileY: i })),
})

export default async () => {
  await describe('buildGameRulesModel', async () => {
    await it('separates the always-on floor from the switchable rows', async () => {
      const systems = {
        core: system('core', 'Core', { editor: { label: 'Core', kidLabel: 'basics', icon: 'i', base: true } }),
        combat: system('combat', 'Action combat'),
      }
      const model = buildGameRulesModel({ systems })
      expect(model.alwaysOn.map((r) => r.id)).toStrictEqual(['core'])
      expect(model.switchable.map((r) => r.id)).toStrictEqual(['combat'])
      expect(model.switchable[0].enabled).toBe(false)
      expect(model.alwaysOn[0].enabled).toBe(true)
    })

    await it('renders empty-but-correct when only base systems ship', async () => {
      // The shipped state of THIS build: no switchable system exists, so
      // the page must be an "Always on" group and nothing else — not a
      // titled empty group that reads as broken.
      const model = buildGameRulesModel()
      expect(model.switchable).toStrictEqual([])
      expect(model.alwaysOn.map((r) => r.id)).toStrictEqual(['core', 'inventory'])
      expect(model.alwaysOn.every((r) => r.enabled)).toBe(true)
      expect(model.alwaysOn.every((r) => r.kidLabel.length > 0)).toBe(true)
    })

    await it('names what a switch also turns on, and what locks it', async () => {
      const systems = {
        stats: system('stats', 'Stats'),
        combat: system('combat', 'Action combat', { requires: ['stats'] }),
      }
      const off = buildGameRulesModel({ systems })
      expect(off.switchable.find((r) => r.id === 'combat')?.alsoEnables).toStrictEqual(['Stats'])
      expect(off.switchable.find((r) => r.id === 'stats')?.neededBy).toStrictEqual([])

      const on = buildGameRulesModel({ systems, project: { gameSystems: { combat: { enabled: true } } } })
      // `stats` is on because `combat` requires it — the row reports the
      // effective truth, not just its own switch — and it is locked,
      // because turning it off would leave `combat` half-wired.
      expect(on.switchable.find((r) => r.id === 'stats')?.enabled).toBe(true)
      expect(on.switchable.find((r) => r.id === 'stats')?.neededBy).toStrictEqual(['Action combat'])
    })

    await it('counts the entities and placements a switch-off would make dormant', async () => {
      const systems = { combat: system('combat', 'Action combat', { components: [componentOf('hostile')] }) }
      const project = {
        entityLibrary: [entity('slime', ['visual', 'hostile']), entity('sign', ['visual'])],
        gameSystems: {},
      }
      const model = buildGameRulesModel({
        systems,
        project,
        maps: [map(['slime', 'slime', 'sign']), map(['sign']), map(['slime'])],
      })
      expect(model.switchable[0].usage).toStrictEqual({ entities: 1, placements: 3, maps: 2 })
    })

    await it('counts an entity that only carries the component inside a state', async () => {
      // A state overlay is still authored data that stops working when
      // the system goes dormant, so it counts.
      const systems = { combat: system('combat', 'Action combat', { components: [componentOf('hostile')] }) }
      const project = {
        entityLibrary: [
          { ...entity('door', ['visual']), states: [{ id: 'angry', components: [{ type: 'hostile' }] }] },
        ],
        gameSystems: {},
      }
      expect(buildGameRulesModel({ systems, project }).switchable[0].usage.entities).toBe(1)
    })

    await it('counts an inline placement with no library entry', async () => {
      const systems = { combat: system('combat', 'Action combat', { components: [componentOf('hostile')] }) }
      const maps: Pick<MapData, 'objectPlacements'>[] = [
        {
          objectPlacements: [
            {
              id: 'p0',
              layerId: 'l',
              tileX: 0,
              tileY: 0,
              inline: { id: 'x', name: 'X', components: [{ type: 'hostile' }] },
            },
          ],
        },
      ]
      expect(buildGameRulesModel({ systems, maps }).switchable[0].usage).toStrictEqual({
        entities: 0,
        placements: 1,
        maps: 1,
      })
    })
  })
}
