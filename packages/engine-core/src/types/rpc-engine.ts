import { EngineStatus } from './engine-status'
import { ProjectLoadOptions } from './project-options'

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
}

/**
 * Type mapping for message data based on message type
 */
export interface RpcEngineDataMap {
  // Commands
  [RpcEngineType.START]: {}
  [RpcEngineType.STOP]: {}
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
  [RpcEngineType.INPUT_EVENT]: { messageType: string; payload: any }
}

/**
 * Generic engine message with typed data based on message type
 */
export interface RpcEngine<T extends RpcEngineType = RpcEngineType> {
  type: T
  data: RpcEngineDataMap[T]
}
