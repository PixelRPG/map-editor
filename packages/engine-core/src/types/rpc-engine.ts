import {
  type RpcMethodRegistry,
  type RpcResponse,
} from '@pixelrpg/message-channel-core'
import { EngineStatus } from './engine-status'
import { ProjectLoadOptions } from './project-options'
import { InputEvent, InputEventType } from './input-event'

/**
 * Unified engine message types for both commands and events
 */
export enum RpcEngineType {
  // Commands (imperative actions)
  START = 'start',
  STOP = 'stop',
  LOAD_PROJECT = 'load-project',
  LOAD_MAP = 'load-map',

  // Events (reactive notifications)
  STATUS_CHANGED = 'status-changed',
  PROJECT_LOADED = 'project-loaded',
  MAP_LOADED = 'map-loaded',
  ERROR = 'error',
  INPUT_EVENT = 'input-event',

  // Communication events
  NOTIFY_ENGINE_EVENT = 'notify-engine-event',
  HANDLE_INPUT_EVENT = 'handle-input-event',

  // TileMap interaction events
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',

  // Editor state synchronization
  EDITOR_STATE_CHANGED = 'editor-state-changed',
}

/**
 * Type mapping for message parameters based on message type
 */
export interface RpcEngineParamMap {
  // Commands
  [RpcEngineType.START]: void
  [RpcEngineType.STOP]: void
  [RpcEngineType.LOAD_PROJECT]: {
    projectPath: string
    options?: ProjectLoadOptions
  }
  [RpcEngineType.LOAD_MAP]: { mapId: string }

  // Events
  [RpcEngineType.STATUS_CHANGED]: EngineStatus
  [RpcEngineType.PROJECT_LOADED]: {
    projectPath: string
    options?: ProjectLoadOptions
  }
  [RpcEngineType.MAP_LOADED]: { mapId: string }
  [RpcEngineType.ERROR]: { message: string; error?: Error }
  [RpcEngineType.INPUT_EVENT]: InputEvent
  [RpcEngineType.NOTIFY_ENGINE_EVENT]: {
    type: RpcEngineType
    data: RpcEngineParamMap[Exclude<
      keyof RpcEngineParamMap,
      RpcEngineType.START | RpcEngineType.STOP
    >]
  }
  [RpcEngineType.HANDLE_INPUT_EVENT]: InputEvent<InputEventType>

  // TileMap interaction
  [RpcEngineType.TILE_CLICKED]: {
    coords: { x: number; y: number }
    tileMapId: string
  }
  [RpcEngineType.TILE_HOVERED]: {
    coords: { x: number; y: number } | null
    tileMapId: string
  }
  [RpcEngineType.TILE_PLACED]: {
    coords: { x: number; y: number }
    tileId: number
    layerId: string
  }

  // Editor state
  [RpcEngineType.EDITOR_STATE_CHANGED]: {
    tool: 'brush' | 'eraser' | 'fill' | null
    tileId: number | null
    layerId: string | null
  }
}

/**
 * Engine RPC registry
 */
export interface EngineRpcRegistry extends RpcMethodRegistry {
  [RpcEngineType.START]: {
    params: RpcEngineParamMap[RpcEngineType.START]
    response: RpcResponse<void>
  }
  [RpcEngineType.STOP]: {
    params: RpcEngineParamMap[RpcEngineType.STOP]
    response: RpcResponse<void>
  }
  [RpcEngineType.LOAD_PROJECT]: {
    params: RpcEngineParamMap[RpcEngineType.LOAD_PROJECT]
    response: RpcResponse<void>
  }
  [RpcEngineType.LOAD_MAP]: {
    params: RpcEngineParamMap[RpcEngineType.LOAD_MAP]
    response: RpcResponse<void>
  }
  [RpcEngineType.NOTIFY_ENGINE_EVENT]: {
    params: RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT]
    response: RpcResponse<void>
  }
  [RpcEngineType.HANDLE_INPUT_EVENT]: {
    params: RpcEngineParamMap[RpcEngineType.HANDLE_INPUT_EVENT]
    response: RpcResponse<void>
  }
  [RpcEngineType.TILE_CLICKED]: {
    params: RpcEngineParamMap[RpcEngineType.TILE_CLICKED]
    response: RpcResponse<void>
  }
  [RpcEngineType.TILE_HOVERED]: {
    params: RpcEngineParamMap[RpcEngineType.TILE_HOVERED]
    response: RpcResponse<void>
  }
  [RpcEngineType.TILE_PLACED]: {
    params: RpcEngineParamMap[RpcEngineType.TILE_PLACED]
    response: RpcResponse<void>
  }
}
