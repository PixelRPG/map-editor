import { type NpcWaypoint, NpcRouteComponent } from '../../components/index.ts'
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
    return new NpcRouteComponent(d.waypoints ?? [], d.facing)
  },
}
