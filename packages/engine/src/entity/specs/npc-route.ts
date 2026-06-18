import { NpcRouteComponent, type NpcWaypoint } from '../../components/index.ts'
import type { ComponentData, Facing } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** NPC route — patrol waypoints + initial facing (split out of the old NPC kind). */
interface NpcRouteData extends ComponentData {
  type: 'npc-route'
  waypoints?: NpcWaypoint[]
  facing?: Facing
}

export const npcRouteSpec: ComponentSpec = {
  type: 'npc-route',
  editor: { label: 'NPC route', icon: 'route-symbolic', markerColor: '#66cc66' },
  fields: [
    // A bespoke waypoint-on-map editor is a follow-up; a JSON field is the
    // escape hatch until then.
    { key: 'waypoints', label: 'Waypoints', input: 'json' },
    { key: 'facing', label: 'Initial facing', input: 'facing' },
  ],
  build: (data) => {
    const d = data as NpcRouteData
    // `waypoints` is a free-form `json` field (and legacy migration pushes
    // `props.route` verbatim), so guard each entry to a well-formed numeric
    // tile coord before it reaches the runtime component.
    const waypoints = (d.waypoints ?? []).filter(isWaypoint)
    return new NpcRouteComponent(waypoints, d.facing)
  },
}

/** True when a value is a `{ tileX, tileY }` pair of finite numbers. */
function isWaypoint(w: unknown): w is NpcWaypoint {
  if (w == null || typeof w !== 'object') return false
  const { tileX, tileY } = w as Record<string, unknown>
  return typeof tileX === 'number' && Number.isFinite(tileX) && typeof tileY === 'number' && Number.isFinite(tileY)
}
