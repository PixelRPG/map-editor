import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Movement — grid-movement speed in tiles/second. Data-only: `build`
 * returns `null` because `PlayerSystem` reads the speed straight off the
 * definition (via `getComponentData`) rather than from an ECS component.
 * The field still drives validation + the inspector.
 */
interface MovementData extends ComponentData {
  type: 'movement'
  tilesPerSec: number
}

export const movementSpec: ComponentSpec = {
  type: 'movement',
  editor: { label: 'Movement', icon: 'find-location-symbolic', basic: true },
  fields: [
    {
      key: 'tilesPerSec',
      label: 'Speed (tiles/second)',
      input: 'float',
      basic: true,
      default: 4,
      min: 0.5,
      max: 16,
      step: 0.5,
    },
  ],
  // Read off the definition by PlayerSystem — no runtime component to build.
  build: () => null,
}

export type { MovementData }
