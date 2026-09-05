import { describe, expect, it } from '@gjsify/unit'
import type { NpcRouteComponent } from '../components/index.ts'
import type { ComponentData } from '../types/data/index.ts'
import { BUILT_IN_COMPONENT_SPECS, discoverComponentSpecs } from './registry.ts'

/**
 * A healthy walk of the specs barrel finds at least this many specs. The
 * registry is DERIVED from that walk, so a walk that silently returned
 * nothing would produce an empty registry and a green "every discovered
 * spec is registered" — indistinguishable from a clean tree. Same
 * lower-bound discipline as the repo's `scripts/check-*.mjs` guards.
 */
const MIN_COMPONENT_SPECS = 12

export default async () => {
  await describe('BUILT_IN_COMPONENT_SPECS registry', async () => {
    await it('is exactly the specs barrel, and the barrel walk is not broken', async () => {
      // The registry is derived, so "every discovered spec is registered"
      // cannot fail on its own — what CAN fail is the walk finding
      // nothing, or two specs colliding on one `type` and one silently
      // winning. Both are checked here; WHO owns each spec is checked by
      // `game-systems/registry.spec.ts`.
      const discovered = discoverComponentSpecs()
      expect(discovered.length).toBeGreaterThanOrEqual(MIN_COMPONENT_SPECS)
      expect(Object.keys(BUILT_IN_COMPONENT_SPECS).length).toBe(discovered.length)
      for (const spec of discovered) {
        expect(BUILT_IN_COMPONENT_SPECS[spec.type]).toBe(spec)
      }
    })

    await it('every spec names an owning game system', async () => {
      // Without an owner a spec can never reach an effective registry.
      for (const spec of discoverComponentSpecs()) {
        expect(typeof spec.system).toBe('string')
        expect(spec.system.length).toBeGreaterThan(0)
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
