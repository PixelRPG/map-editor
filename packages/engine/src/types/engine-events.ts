import type { Facing } from './data/index.ts'
import type { EngineStatus } from './engine-status.ts'
import type { ProjectLoadOptions } from './project-options.ts'

/**
 * Engine event names emitted via the engine's EventEmitter.
 */
export enum EngineEvent {
  STATUS_CHANGED = 'status-changed',
  PROJECT_LOADED = 'project-loaded',
  MAP_LOADED = 'map-loaded',
  ERROR = 'error',
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',
  PLAYER_SPAWNED = 'player-spawned',
  TRIGGER_FIRED = 'trigger-fired',
  WALKED_ONTO_TILE = 'walked-onto-tile',
}

export interface EngineEventMap {
  [EngineEvent.STATUS_CHANGED]: { status: EngineStatus }
  [EngineEvent.PROJECT_LOADED]: { projectPath: string; options?: ProjectLoadOptions }
  [EngineEvent.MAP_LOADED]: { mapId: string }
  [EngineEvent.ERROR]: { message: string; cause?: Error }
  [EngineEvent.TILE_CLICKED]: { coords: { x: number; y: number }; tileMapId: string }
  [EngineEvent.TILE_HOVERED]: { coords: { x: number; y: number } | null; tileMapId: string }
  [EngineEvent.TILE_PLACED]: { coords: { x: number; y: number }; tileId: number; layerId: string }
  /**
   * Emitted by `PlayerSpawnSystem` once per scene activate after
   * resolving the player's spawn-point. `tileX/Y` default to (0, 0)
   * if no spawn point exists.
   */
  [EngineEvent.PLAYER_SPAWNED]: { tileX: number; tileY: number; facing?: Facing }
  /**
   * Emitted by `TriggerSystem` when a trigger condition is met.
   * Listeners narrow by component (TeleportComponent / ItemComponent
   * / …) on the firing entity to decide whether to act.
   */
  [EngineEvent.TRIGGER_FIRED]: { entityId: number; by: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' }
  /**
   * Emitted by `WalkOnTileSystem` when the player steps onto a new
   * tile — carries the resolved `TileProperties` from the
   * sprite-set so audio / encounter / blocker systems can react.
   */
  [EngineEvent.WALKED_ONTO_TILE]: {
    tileX: number
    tileY: number
    properties: Record<string, unknown>
  }
}
