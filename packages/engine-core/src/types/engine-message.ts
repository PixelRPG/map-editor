import { EngineStatus } from './engine-status'
import { ProjectLoadOptions } from './project-options'

/**
 * Unified engine message types for both commands and events
 */
export enum EngineMessageType {
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
export interface EngineMessageDataMap {
  // Commands
  [EngineMessageType.START]: {}
  [EngineMessageType.STOP]: {}
  [EngineMessageType.LOAD_PROJECT]: {
    projectPath: string
    options?: ProjectLoadOptions
  }
  [EngineMessageType.LOAD_MAP]: { mapId: string }

  // Events
  [EngineMessageType.STATUS_CHANGED]: EngineStatus
  [EngineMessageType.PROJECT_LOADED]: {
    projectPath: string
    options?: ProjectLoadOptions
  }
  [EngineMessageType.MAP_LOADED]: { mapId: string }
  [EngineMessageType.ERROR]: { message: string; error?: Error }
  [EngineMessageType.INPUT_EVENT]: { messageType: string; payload: any }
}

/**
 * Base type for all engine message data
 */
export type EngineMessageData = EngineMessageDataMap[EngineMessageType]

/**
 * Generic engine message with typed data based on message type
 */
export interface EngineMessage<
  T extends EngineMessageType = EngineMessageType,
> {
  type: T
  data: EngineMessageDataMap[T]
}

/**
 * Message handler function type for engine messages
 */
export type EngineMessageHandler = (
  message: EngineMessage,
) => void | Promise<void>

// Note: Legacy type aliases are kept in their original files for backward compatibility
