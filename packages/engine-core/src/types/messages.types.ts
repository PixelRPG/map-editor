import { MessageData } from '@pixelrpg/messages-core';
import {
    EngineEvent,
    InputEvent,
    ProjectLoadOptions
} from './index.ts';
import { EngineMessageType, EngineCommandType } from './message-types.ts';


/**
 * Message event for engine events
 */
export type EngineMessageEventEngine = MessageData<EngineMessageType.ENGINE_EVENT, EngineEvent>

/**
 * Message event for input events
 */
export type EngineMessageEventInput = MessageData<EngineMessageType.INPUT_EVENT, InputEvent>

/**
 * Message for sending commands to the engine
 */
export type EngineMessageCommand = MessageData<EngineMessageType.COMMAND, {
    command: EngineCommandType;
}>

/**
 * Message to load a project
 */
export type EngineMessageLoadProject = MessageData<EngineMessageType.LOAD_PROJECT, {
    projectPath: string;
    options?: ProjectLoadOptions;
}>

/**
 * Message to load a specific map
 */
export type EngineMessageLoadMap = MessageData<EngineMessageType.LOAD_MAP, {
    mapId: string;
}>

/**
 * Union type of all engine-specific messages
 */
export type EngineMessage =
    | EngineMessageEventEngine
    | EngineMessageEventInput
    | EngineMessageCommand
    | EngineMessageLoadProject
    | EngineMessageLoadMap;
