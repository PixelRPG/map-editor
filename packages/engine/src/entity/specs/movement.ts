import { MovementComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Movement — grid-movement speed in tiles/second.
 *
 * `PlayerSystem` still reads the hero's speed off the flat
 * {@link CharacterDefinition} view model it is handed, so for the player
 * this component is inert. It exists for everything that is *not* the
 * player: `HostileAiSystem` drives ordinary placements and has no view
 * model to read, so the speed has to be on the entity it is moving.
 */
interface MovementData extends ComponentData {
  type: 'movement'
  tilesPerSec: number
}

/** Matches the field descriptor's `default` — one number, one place. */
const DEFAULT_TILES_PER_SEC = 4

export const movementSpec: ComponentSpec = {
  type: 'movement',
  system: 'core',
  editor: { label: 'Movement', icon: 'find-location-symbolic', basic: true },
  fields: [
    {
      key: 'tilesPerSec',
      label: 'Speed (tiles/second)',
      input: 'float',
      basic: true,
      default: DEFAULT_TILES_PER_SEC,
      min: 0.5,
      max: 16,
      step: 0.5,
    },
  ],
  build: (data) => {
    const d = data as MovementData
    return new MovementComponent(Math.max(0, d.tilesPerSec ?? DEFAULT_TILES_PER_SEC))
  },
}

export type { MovementData }
