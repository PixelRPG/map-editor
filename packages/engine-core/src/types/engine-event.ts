import { EngineEventType } from './engine-event-type';
import { EngineStatus } from './engine-status';

/**
 * Type mapping for event data based on event type
 */
export interface EngineEventDataMap {
    [EngineEventType.STATUS_CHANGED]: EngineStatus;
    [EngineEventType.PROJECT_LOADED]: { projectId: string };
    [EngineEventType.MAP_LOADED]: { mapId: string };
    [EngineEventType.ERROR]: { message: string, error?: Error };
}

/**
 * Base type for all engine event data
 */
export type EngineEventData = EngineEventDataMap[EngineEventType];

/**
 * Generic engine event with typed data based on event type
 */
export interface EngineEvent<T extends EngineEventType = EngineEventType> {
    type: T;
    data?: EngineEventDataMap[T];
}

/**
 * Event handler function type for engine events
 */
export type EngineEventHandler = (event: EngineEvent) => void; 