/**
 * Options for loading a game project
 */
export interface ProjectLoadOptions {
    /**
     * Whether to preload all sprite sets
     */
    preloadAllSpriteSets?: boolean;

    /**
     * Whether to preload all maps
     */
    preloadAllMaps?: boolean;

    /**
     * Initial map ID to load
     */
    initialMapId?: string;
}

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
 * Engine event data
 */
export interface EngineEvent {
    type: EngineEventType;
    data?: any;
}

/**
 * Position in the game world
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Mouse event data
 */
export interface MouseEventData {
    position: Position;
    button?: number;
}

/**
 * Input event types
 */
export enum InputEventType {
    MOUSE_MOVE = 'mouse-move',
    MOUSE_DOWN = 'mouse-down',
    MOUSE_UP = 'mouse-up',
    MOUSE_ENTER = 'mouse-enter',
    MOUSE_LEAVE = 'mouse-leave',
}

/**
 * Input event data
 */
export interface InputEvent {
    type: InputEventType;
    data: MouseEventData;
} 