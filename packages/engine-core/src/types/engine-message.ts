import { BaseMessage } from '@pixelrpg/message-channel-core';
import { EngineEvent } from './engine-event';
import { InputEvent } from './input-event';
import { EngineMessageType } from './engine-message-type';
import { EngineCommandType } from './engine-command-type';
import { ProjectLoadOptions } from './project-options';

/**
 * Base interface for all engine messages
 */
export interface EngineMessageBase extends BaseMessage {
    messageType: EngineMessageType;
    payload: unknown;
}

/**
 * Message event for engine events
 */
export interface EngineMessageEventEngine extends EngineMessageBase {
    messageType: EngineMessageType.ENGINE_EVENT;
    payload: EngineEvent;
}

/**
 * Message event for input events
 */
export interface EngineMessageEventInput extends EngineMessageBase {
    messageType: EngineMessageType.INPUT_EVENT;
    payload: InputEvent;
}

/**
 * Message for sending commands to the engine
 */
export interface EngineMessageCommand extends EngineMessageBase {
    messageType: EngineMessageType.COMMAND;
    payload: {
        command: EngineCommandType;
    };
}

/**
 * Message to load a project
 */
export interface EngineMessageLoadProject extends EngineMessageBase {
    messageType: EngineMessageType.LOAD_PROJECT;
    payload: {
        projectPath: string;
        options?: ProjectLoadOptions;
    };
}

/**
 * Message to load a specific map
 */
export interface EngineMessageLoadMap extends EngineMessageBase {
    messageType: EngineMessageType.LOAD_MAP;
    payload: {
        mapId: string;
    };
}

/**
 * Union type of all engine-specific messages
 */
export type EngineMessage =
    | EngineMessageEventEngine
    | EngineMessageEventInput
    | EngineMessageCommand
    | EngineMessageLoadProject
    | EngineMessageLoadMap; 