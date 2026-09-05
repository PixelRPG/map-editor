import { describe, expect, it } from '@gjsify/unit'
import { discoverComponentSpecs } from '../entity/registry.ts'
import { type GameSystemSpec, isGameSystemSpec } from './game-system-spec.ts'
import {
  BUILT_IN_GAME_SYSTEMS,
  effectiveComponentRegistry,
  effectiveGameSystems,
  enabledDependentsOf,
  isGameSystemEnabled,
  unknownGameSystemIds,
  withGameSystemEnabled,
} from './registry.ts'
import * as Specs from './specs/index.ts'

/**
 * Auto-discover every shipped game system from the specs barrel. A game
 * system is any export passing `isGameSystemSpec`. `check:barrels`
 * guarantees the barrel re-exports every `specs/*.ts`, so this finds
 * every system without a hand-maintained list — the same discipline as
 * `entity/registry.spec.ts` and `commands/registry.spec.ts`.
 */
function discoverGameSystems(): GameSystemSpec[] {
  return (Object.values(Specs) as unknown[]).filter(isGameSystemSpec)
}

/** A minimal spec factory for the graph assertions below. */
function fixture(id: string, requires?: string[], components: GameSystemSpec['components'] = []): GameSystemSpec {
  return {
    id,
    editor: { label: id, kidLabel: id, icon: 'x-symbolic' },
    ...(requires ? { requires } : {}),
    components,
    runtime: () => [],
  }
}

export default async () => {
  await describe('BUILT_IN_GAME_SYSTEMS registry', async () => {
    await it('every shipped game system is registered (and no stale entries)', async () => {
      // A game system nothing registers owns components the effective
      // registry never yields: its entities validate as "unregistered
      // type" and vanish at spawn. Fail here instead.
      const discovered = discoverGameSystems()
      expect(discovered.length).toBeGreaterThan(0)
      for (const spec of discovered) {
        expect(BUILT_IN_GAME_SYSTEMS[spec.id]).toBe(spec)
      }
      const discoveredIds = discovered.map((s) => s.id)
      for (const id of Object.keys(BUILT_IN_GAME_SYSTEMS)) {
        expect(discoveredIds).toContain(id)
      }
    })

    await it('registry keys match each spec.id', async () => {
      for (const [key, spec] of Object.entries(BUILT_IN_GAME_SYSTEMS)) {
        expect(key).toBe(spec.id)
      }
    })

    await it('every component spec in the repo is owned by exactly one game system', async () => {
      // THE ownership assertion — what replaces the hand-written
      // BUILT_IN_COMPONENT_SPECS map. A component with no owner can never
      // appear in an effective registry; a component with two owners
      // appears or disappears depending on which system is on.
      const ownersByType = new Map<string, string[]>()
      for (const system of Object.values(BUILT_IN_GAME_SYSTEMS)) {
        for (const component of system.components) {
          ownersByType.set(component.type, [...(ownersByType.get(component.type) ?? []), system.id])
        }
      }
      for (const [type, owners] of ownersByType) {
        expect(`${type}: ${owners.join(', ')}`).toBe(`${type}: ${owners[0]}`)
      }

      const discovered = discoverComponentSpecs()
      expect(discovered.length).toBeGreaterThan(0)
      for (const spec of discovered) {
        // Every shipped spec is claimed …
        expect(ownersByType.get(spec.type)).toBeDefined()
        // … by the system its own `system` field names.
        expect(`${spec.type} owned by ${ownersByType.get(spec.type)?.[0]}`).toBe(`${spec.type} owned by ${spec.system}`)
      }
      // … and no system claims a component that does not exist.
      const discoveredTypes = discovered.map((s) => s.type)
      for (const type of ownersByType.keys()) {
        expect(discoveredTypes).toContain(type)
      }
    })

    await it('every owning system id is registered', async () => {
      for (const spec of discoverComponentSpecs()) {
        expect(Object.keys(BUILT_IN_GAME_SYSTEMS)).toContain(spec.system)
      }
    })

    await it('requires closes over registered ids', async () => {
      for (const system of Object.values(BUILT_IN_GAME_SYSTEMS)) {
        for (const required of system.requires ?? []) {
          expect(Object.keys(BUILT_IN_GAME_SYSTEMS)).toContain(required)
        }
      }
    })

    await it('requires has no cycle', async () => {
      // A cycle makes `effectiveGameSystems` non-terminating in the naive
      // form and makes "which switch turns this off" unanswerable.
      const visiting = new Set<string>()
      const done = new Set<string>()
      const cycles: string[] = []
      const walk = (id: string, path: string[]): void => {
        if (done.has(id)) return
        if (visiting.has(id)) {
          cycles.push([...path, id].join(' → '))
          return
        }
        visiting.add(id)
        for (const required of BUILT_IN_GAME_SYSTEMS[id]?.requires ?? []) walk(required, [...path, id])
        visiting.delete(id)
        done.add(id)
      }
      for (const id of Object.keys(BUILT_IN_GAME_SYSTEMS)) walk(id, [])
      expect(cycles).toStrictEqual([])
    })

    await it('a template only seeds components its system can render', async () => {
      // Own components + those of everything it requires + core's. A
      // template seeding anything else offers the user a component the
      // inspector cannot render and the spawn pipeline cannot build.
      const core = BUILT_IN_GAME_SYSTEMS.core
      for (const system of Object.values(BUILT_IN_GAME_SYSTEMS)) {
        const reachable = new Set<string>()
        for (const component of [...system.components, ...(core?.components ?? [])]) reachable.add(component.type)
        for (const required of system.requires ?? []) {
          for (const component of BUILT_IN_GAME_SYSTEMS[required]?.components ?? []) reachable.add(component.type)
        }
        for (const template of system.templates ?? []) {
          for (const component of template.components) {
            expect(`${template.id}: ${component.type}`).toBe(
              `${template.id}: ${reachable.has(component.type) ? component.type : `UNREACHABLE ${component.type}`}`,
            )
          }
        }
      }
    })

    await it('the base layer is core, stats and inventory', async () => {
      // Pinned deliberately: a base system is always on and therefore
      // costs every project its components and its runtime. Adding one is
      // a decision, not a default — `time` was dropped from this layer
      // exactly because its only reader is deferred.
      const base = Object.values(BUILT_IN_GAME_SYSTEMS)
        .filter((s) => s.editor.base)
        .map((s) => s.id)
      expect(base.sort()).toStrictEqual(['core', 'inventory', 'stats'])
    })
  })

  await describe('effective game systems', async () => {
    await it('base systems are on with no project data at all', async () => {
      expect(effectiveGameSystems(null).map((s) => s.id)).toStrictEqual(['core', 'stats', 'inventory'])
      expect(effectiveGameSystems({}).map((s) => s.id)).toStrictEqual(['core', 'stats', 'inventory'])
    })

    await it('an optional system is off until the project enables it', async () => {
      const systems = { base: fixture('base'), extra: fixture('extra') }
      systems.base.editor.base = true
      expect(effectiveGameSystems({}, systems).map((s) => s.id)).toStrictEqual(['base'])
      expect(isGameSystemEnabled(systems.extra, { gameSystems: { extra: { enabled: false } } })).toBe(false)
      const on = { gameSystems: { extra: { enabled: true } } }
      expect(effectiveGameSystems(on, systems).map((s) => s.id)).toStrictEqual(['base', 'extra'])
    })

    await it('enabling a system pulls in what it requires', async () => {
      const systems = { dep: fixture('dep'), main: fixture('main', ['dep']) }
      const on = { gameSystems: { main: { enabled: true } } }
      expect(effectiveGameSystems(on, systems).map((s) => s.id)).toStrictEqual(['dep', 'main'])
      expect(withGameSystemEnabled(undefined, 'main', true, systems)).toStrictEqual({
        main: { enabled: true },
        dep: { enabled: true },
      })
      expect(enabledDependentsOf('dep', on, systems).map((s) => s.id)).toStrictEqual(['main'])
    })

    await it('switching off preserves the record and never removes data', async () => {
      const systems = { extra: fixture('extra') }
      const current = { extra: { enabled: true, config: { pace: 3 } } }
      expect(withGameSystemEnabled(current, 'extra', false, systems)).toStrictEqual({
        extra: { enabled: false, config: { pace: 3 } },
      })
    })
  })

  await describe('effective component registry', async () => {
    await it('yields every base system component and nothing else', async () => {
      const registry = effectiveComponentRegistry(null)
      // `item` proves the move out of core landed: it is inventory's now.
      expect(registry.item).toBeDefined()
      expect(registry.visual).toBeDefined()
      expect(registry.stats).toBeDefined()
      expect(Object.keys(registry).length).toBe(discoverComponentSpecs().length)
    })

    await it('omits a disabled system component — dormant, not deleted', async () => {
      const owned = discoverComponentSpecs().find((s) => s.type === 'item')
      if (!owned) throw new Error('item spec missing')
      const systems = { core: fixture('core'), extra: fixture('extra', undefined, [owned]) }
      systems.core.editor.base = true
      expect(effectiveComponentRegistry({}, systems).item).toBeUndefined()
      expect(effectiveComponentRegistry({ gameSystems: { extra: { enabled: true } } }, systems).item).toBe(owned)
    })
  })

  await describe('unknown game systems', async () => {
    await it('are reported, not silently dropped', async () => {
      const project = { gameSystems: { core: { enabled: true }, 'combat-turn': { enabled: true } } }
      expect(unknownGameSystemIds(project)).toStrictEqual(['combat-turn'])
      // …and the project still resolves to its known systems.
      expect(effectiveGameSystems(project).map((s) => s.id)).toStrictEqual(['core', 'stats', 'inventory'])
    })
  })
}
