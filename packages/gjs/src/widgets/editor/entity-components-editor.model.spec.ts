import { describe, expect, it } from '@gjsify/unit'
import type { ComponentSpec, ComponentSpecRegistry, GameSystemSpec } from '@pixelrpg/engine'
import { addableComponentGroups, dormantComponentFacts } from './entity-components-editor.model.ts'

const spec = (type: string, system: string): ComponentSpec => ({
  type,
  system,
  fields: [],
  editor: { label: `L:${type}`, icon: `${type}-symbolic` },
  build: () => null,
})

const registry = (...specs: ComponentSpec[]): ComponentSpecRegistry => Object.fromEntries(specs.map((s) => [s.type, s]))

const system = (id: string, extra: Partial<GameSystemSpec['editor']> = {}): GameSystemSpec => ({
  id,
  editor: { label: `S:${id}`, kidLabel: `K:${id}`, icon: `${id}-symbolic`, ...extra },
  components: [],
  runtime: () => [],
})

/** Two systems in a deliberate order, so "registry order" is observable. */
const SYSTEMS: Record<string, GameSystemSpec> = {
  core: system('core', { base: true }),
  stats: system('stats'),
}

export default async () => {
  await describe('addableComponentGroups', async () => {
    await it('groups the offered specs under their owning system', async () => {
      const offered = registry(spec('visual', 'core'), spec('health', 'stats'), spec('movement', 'core'))
      const groups = addableComponentGroups(offered, [], SYSTEMS)
      expect(groups.length).toBe(2)
      expect(groups[0].systemId).toBe('core')
      expect(groups[0].systemLabel).toBe('S:core')
      expect(groups[0].specs.map((s) => s.type)).toStrictEqual(['visual', 'movement'])
      expect(groups[1].systemId).toBe('stats')
      expect(groups[1].specs.map((s) => s.type)).toStrictEqual(['health'])
    })

    await it('drops the types the entity already carries', async () => {
      const offered = registry(spec('visual', 'core'), spec('health', 'stats'))
      const groups = addableComponentGroups(offered, ['health'], SYSTEMS)
      expect(groups.map((g) => g.systemId)).toStrictEqual(['core'])
      expect(groups[0].specs.map((s) => s.type)).toStrictEqual(['visual'])
    })

    await it('drops a system whose every component is already present', async () => {
      const offered = registry(spec('visual', 'core'), spec('health', 'stats'))
      const groups = addableComponentGroups(offered, ['visual', 'health'], SYSTEMS)
      expect(groups).toStrictEqual([])
    })

    await it('offers nothing for a system the registry does not list', async () => {
      // A switched-off system never reaches `offered`, but an unknown
      // OWNER must not fall through into an unheaded group either.
      const offered = registry(spec('loot', 'treasure'))
      expect(addableComponentGroups(offered, [], SYSTEMS)).toStrictEqual([])
    })
  })

  await describe('dormantComponentFacts', async () => {
    const known = registry(spec('visual', 'core'), spec('health', 'stats'))

    await it('describes a known type the project switched off', async () => {
      const effective = registry(spec('visual', 'core'))
      const facts = dormantComponentFacts('health', effective, SYSTEMS, known)
      expect(facts).toStrictEqual({
        type: 'health',
        componentLabel: 'L:health',
        icon: 'health-symbolic',
        systemId: 'stats',
        systemLabel: 'S:stats',
      })
    })

    await it('is null for a type this tier does render', async () => {
      expect(dormantComponentFacts('visual', known, SYSTEMS, known)).toBe(null)
    })

    await it('is null for an unknown type — there is no system to turn on', async () => {
      expect(dormantComponentFacts('wobble', registry(), SYSTEMS, known)).toBe(null)
    })

    await it('is null when the owning system is unregistered', async () => {
      const orphan = registry(spec('loot', 'treasure'))
      expect(dormantComponentFacts('loot', registry(), SYSTEMS, orphan)).toBe(null)
    })
  })
}
