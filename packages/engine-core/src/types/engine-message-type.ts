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