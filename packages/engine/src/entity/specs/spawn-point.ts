import { SpawnPointComponent } from '../../components/index.ts'
import type { ComponentData, Facing } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Spawn point — entity spawn marker (`'player'` or a project-specific id). */
interface SpawnPointData extends ComponentData {
  type: 'spawn-point'
  spawnId?: string
  facing?: Facing
}

export const spawnPointSpec: ComponentSpec = {
  type: 'spawn-point',
  editor: { label: 'Spawn point', icon: 'mark-location-symbolic', markerColor: '#cc66ff' },
  fields: [
    { key: 'spawnId', label: 'Spawn id', input: 'text', required: true, basic: true, default: 'player' },
    { key: 'facing', label: 'Facing', input: 'facing' },
  ],
  build: (data) => {
    const d = data as SpawnPointData
    return new SpawnPointComponent(d.spawnId ?? 'player', d.facing)
  },
}
