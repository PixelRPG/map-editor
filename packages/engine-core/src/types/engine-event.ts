import { EngineEventType } from './engine-event-type'
import { EngineStatus } from './engine-status'
import { ProjectLoadOptions } from './project-options'

/**
 * Type mapping for event data based on event type
 * @deprecated Use EngineMessageDataMap instead
 */
export interface EngineEventDataMap {
  [EngineEventType.STATUS_CHANGED]: EngineStatus
  [EngineEventType.PROJECT_LOADED]: {
    projectPath: string
    options?: ProjectLoadOptions
  }
  [EngineEventType.MAP_LOADED]: { mapId: string }
  [EngineEventType.ERROR]: { message: string; error?: Error }
}

/**
 * Base type for all engine event data
 * @deprecated Use EngineMessageData instead
 */
export type EngineEventData = EngineEventDataMap[EngineEventType]

/**
 * Generic engine event with typed data based on event type
 * @deprecated Use EngineMessage instead
 */
export interface EngineEvent<T extends EngineEventType = EngineEventType> {
  type: T
  data: EngineEventDataMap[T]
}

/**
 * Event handler function type for engine events
 * @deprecated Use EngineMessageHandler instead
 */
export type EngineEventHandler = (event: EngineEvent) => void
