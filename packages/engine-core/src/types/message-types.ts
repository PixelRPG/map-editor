/**
 * Types of messages that can be sent between engine implementations
 */
export enum EngineMessageType {
    LOAD_PROJECT = 'load-project',
    LOAD_MAP = 'load-map',
    ENGINE_EVENT = 'engine-event',
    INPUT_EVENT = 'input-event',
    COMMAND = 'command',
}

/**
 * Command types that can be sent to the engine
 */
export enum EngineCommandType {
    START = 'start',
    STOP = 'stop',
    PAUSE = 'pause',
    RESUME = 'resume',
} 