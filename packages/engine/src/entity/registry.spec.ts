import { describe, expect, it } from '@gjsify/unit'
import type { NpcRouteComponent } from '../components/index.ts'
import type { ComponentData } from '../types/data/index.ts'
import { type ComponentSpec, isComponentSpec } from './component-spec.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'
import * as Specs from './specs/index.ts'

/**
 * Auto-discover every shipped component spec from the specs barrel. A
 * spec is any export passing `isComponentSpec`. `check:barrels`
 * guarantees the barrel re-exports every `specs/*.ts`, so this finds
 * every spec without a hand-maintained list (same discipline as
 * `commands/registry.spec.ts`).
 */
function discoverSpecs(): ComponentSpec[] {
  return (Object.values(Specs) as unknown[]).filter(isComponentSpec)
}

export default async () => {
  await describe('BUILT_IN_COMPONENT_SPECS registry', async () => {
    await it('every shipped component spec is registered (and no stale entries)', async () => {
      // An unregistered component type fails validation loudly and can't be
      // spawned — so a `specs/*.ts` without a registry entry is a silent
      // composition hole. This fails here if one is added without registering.
      const discovered = discoverSpecs()
      expect(discovered.length).toBeGreaterThan(0)
      for (const spec of discovered) {
        expect(BUILT_IN_COMPONENT_SPECS[spec.type]).toBe(spec)
      }
      const registeredTypes = Object.keys(BUILT_IN_COMPONENT_SPECS)
      const discoveredTypes = discovered.map((s) => s.type)
      for (const type of registeredTypes) {
        expect(discoveredTypes).toContain(type)
      }
    })

    await it('registry keys match each spec.type', async () => {
      for (const [key, spec] of Object.entries(BUILT_IN_COMPONENT_SPECS)) {
        expect(key).toBe(spec.type)
      }
    })

    await it('build() yields the expected runtime components', async () => {
      const ctx = { placementId: 'p', tileX: 0, tileY: 0, tileWidth: 16, tileHeight: 16 }
      // A data-carrying spec builds a component…
      const teleport = BUILT_IN_COMPONENT_SPECS.teleport.build(
        { type: 'teleport', targetMapId: 'm', targetTileX: 1, targetTileY: 2 },
        ctx,
      )
      expect(teleport).not.toBeNull()
      // …while a data-only spec (movement) builds nothing (read off the def).
      expect(BUILT_IN_COMPONENT_SPECS.movement.build({ type: 'movement', tilesPerSec: 4 }, ctx)).toBeNull()
    })

    await it('npc-route build drops malformed waypoints (json-field escape hatch)', async () => {
      const ctx = { placementId: 'p', tileX: 0, tileY: 0, tileWidth: 16, tileHeight: 16 }
      // Mix of well-formed and malformed entries (strings, missing coord, NaN).
      const data: ComponentData = {
        type: 'npc-route',
        waypoints: [
          { tileX: 1, tileY: 2 },
          { tileX: '3', tileY: 4 },
          { tileX: 5 },
          { tileX: Number.NaN, tileY: 6 },
          { tileX: 7, tileY: 8 },
        ],
      }
      const built = BUILT_IN_COMPONENT_SPECS['npc-route'].build(data, ctx) as NpcRouteComponent
      expect(built.waypoints).toStrictEqual([
        { tileX: 1, tileY: 2 },
        { tileX: 7, tileY: 8 },
      ])
    })
  })
}
