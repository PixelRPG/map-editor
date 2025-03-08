import { MessageGeneric } from '@pixelrpg/messages-core';
import { EngineEvent, InputEvent, ProjectLoadOptions } from './engine.types.ts';

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

/**
 * Message text type for engine-specific text messages
 */
export interface EngineMessageText extends MessageGeneric<'text'> {
    data: string;
}

/**
 * Message file type for engine-specific file messages
 */
export interface EngineMessageFile extends MessageGeneric<'file'> {
    path: string;
    data: ArrayBuffer | string;
}

/**
 * Base message event type for engine-specific events
 */
export interface EngineMessageEvent<T = any> extends MessageGeneric<'event'> {
    data: {
        name: string;
        data: T;
    };
}

/**
 * Message event for mouse enter events
 */
export interface EngineMessageEventMouseEnter extends EngineMessageEvent<null> {
    data: {
        name: 'mouse-enter';
        data: null;
    };
}

/**
 * Message event for mouse leave events
 */
export interface EngineMessageEventMouseLeave extends EngineMessageEvent<null> {
    data: {
        name: 'mouse-leave';
        data: null;
    };
}

/**
 * Mouse move event data
 */
export interface EngineMouseMoveData {
    x: number;
    y: number;
}

/**
 * Message event for mouse move events
 */
export interface EngineMessageEventMouseMove extends EngineMessageEvent<EngineMouseMoveData> {
    data: {
        name: 'mouse-move';
        data: EngineMouseMoveData;
    };
}

/**
 * Message event for engine events
 */
export interface EngineMessageEventEngine extends EngineMessageEvent<EngineEvent> {
    data: {
        name: 'engine-event';
        data: EngineEvent;
    };
}

/**
 * Message event for input events
 */
export interface EngineMessageEventInput extends EngineMessageEvent<InputEvent> {
    data: {
        name: 'input-event';
        data: InputEvent;
    };
}

/**
 * Message for sending commands to the engine
 */
export interface EngineMessageCommand extends MessageGeneric<'command'> {
    command: string;
}

/**
 * Message to load a project
 */
export interface EngineMessageLoadProject extends MessageGeneric<'load-project'> {
    projectPath: string;
    options?: ProjectLoadOptions;
}

/**
 * Message to load a specific map
 */
export interface EngineMessageLoadMap extends MessageGeneric<'load-map'> {
    mapId: string;
}

/**
 * Union type of all engine-specific messages
 */
export type EngineMessage =
    | EngineMessageText
    | EngineMessageFile
    | EngineMessageEvent
    | EngineMessageEventMouseEnter
    | EngineMessageEventMouseLeave
    | EngineMessageEventMouseMove
    | EngineMessageEventEngine
    | EngineMessageEventInput
    | EngineMessageCommand
    | EngineMessageLoadProject
    | EngineMessageLoadMap; 