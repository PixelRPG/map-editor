import { TeleportComponent } from '../../components/index.ts'
import type { ComponentData, Facing } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Teleport — scene-switch destination (mirrors `TeleportProperties`). */
interface TeleportData extends ComponentData {
  type: 'teleport'
  targetMapId: string
  targetTileX: number
  targetTileY: number
  facing?: Facing
  label?: string
}

export const teleportSpec: ComponentSpec = {
  type: 'teleport',
  editor: { label: 'Teleport', icon: 'send-to-symbolic', markerColor: '#66ccff' },
  fields: [
    { key: 'targetMapId', label: 'Target map', input: 'map-ref', required: true, basic: true },
    { key: 'targetTileX', label: 'Target X', input: 'int', required: true, basic: true, min: 0 },
    { key: 'targetTileY', label: 'Target Y', input: 'int', required: true, basic: true, min: 0 },
    { key: 'facing', label: 'Arrive facing', input: 'facing' },
    { key: 'label', label: 'Atlas label', input: 'text' },
  ],
  build: (data) => {
    const d = data as TeleportData
    return new TeleportComponent(d.targetMapId, d.targetTileX, d.targetTileY, d.facing)
  },
}
