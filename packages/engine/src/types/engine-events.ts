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
  PLAYER_TILE_CHANGED = 'player-tile-changed',
  PLAYER_ACTION_PRESSED = 'player-action-pressed',
  TRIGGER_FIRED = 'trigger-fired',
  WALKED_ONTO_TILE = 'walked-onto-tile',
  TELEPORT_REQUESTED = 'teleport-requested',
  ITEM_PICKED_UP = 'item-picked-up',
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
   * Emitted by the (future) player-movement system whenever the
   * player crosses a tile boundary. `TriggerSystem` listens on
   * this to fire walk-onto / walk-off triggers.
   *
   * Decoupled from sprite-pixel position — game-specific
   * movement code (smooth sliding, jumping, grid-snapped) can all
   * emit this exactly when the *logical* tile changes.
   */
  [EngineEvent.PLAYER_TILE_CHANGED]: {
    tileX: number
    tileY: number
    /** Previous tile, or `null` if this is the initial spawn. */
    previous: { tileX: number; tileY: number } | null
    facing?: Facing
  }
  /**
   * Emitted by the (future) input system when the player presses
   * the action button. `facing` resolves the adjacent tile that the
   * `TriggerSystem` scans for `action-button`-mode triggers.
   */
  [EngineEvent.PLAYER_ACTION_PRESSED]: { tileX: number; tileY: number; facing: Facing }
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
  /**
   * Emitted by `TeleportSystem` when a teleport entity is
   * triggered. The host engine listens for this and performs the
   * scene-switch + player re-position (engine has no reference to
   * the player itself, project code resolves which actor to move).
   */
  [EngineEvent.TELEPORT_REQUESTED]: {
    targetMapId: string
    targetTileX: number
    targetTileY: number
    facing?: Facing
  }
  /**
   * Emitted by `ItemPickupSystem` when a player triggers an
   * item-bearing entity. The project layer's inventory system
   * listens for this and adds the item.
   */
  [EngineEvent.ITEM_PICKED_UP]: {
    itemId: string
    qty: number
    pickupSound?: string
  }
}
