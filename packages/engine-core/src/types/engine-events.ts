/**
 * Status of the engine
 */
export enum EngineStatus {
    INITIALIZING = 'initializing',
    READY = 'ready',
    LOADING = 'loading',
    RUNNING = 'running',
    ERROR = 'error',
}

/**
 * Engine event types
 */
export enum EngineEventType {
    STATUS_CHANGED = 'status-changed',
    PROJECT_LOADED = 'project-loaded',
    MAP_LOADED = 'map-loaded',
    ERROR = 'error',
}

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