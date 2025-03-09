import { Message } from '@pixelrpg/messages-core';
import {
    EngineEvent,
    InputEvent,
    ProjectLoadOptions
} from './index.ts';
import { EngineMessageType, EngineCommandType } from './message-types.ts';

/**
 * Message text type for engine-specific text messages
 */
export type EngineMessageText = Message<'text', string>

/**
 * Message file type for engine-specific file messages
 */
export type EngineMessageFile = Message<'file', {
    path: string;
    data: ArrayBuffer | string;
}>

/**
 * Base message event type for engine-specific events
 */
export type EngineMessageEvent<N extends string, T = unknown> = Message<'event', {
    name: N;
    data: T;
}>

/**
 * Message event for engine events
 */
export type EngineMessageEventEngine = EngineMessageEvent<EngineMessageType.ENGINE_EVENT, EngineEvent>

/**
 * Message event for input events
 */
export type EngineMessageEventInput = EngineMessageEvent<EngineMessageType.INPUT_EVENT, InputEvent>

/**
 * Message for sending commands to the engine
 */
export type EngineMessageCommand = Message<'command', {
    command: EngineCommandType;
}>

/**
 * Message to load a project
 */
export type EngineMessageLoadProject = Message<EngineMessageType.LOAD_PROJECT, {
    projectPath: string;
    options?: ProjectLoadOptions;
}>

/**
 * Message to load a specific map
 */
export type EngineMessageLoadMap = Message<EngineMessageType.LOAD_MAP, {
    mapId: string;
}>

/**
 * Union type of all engine-specific messages
 */
export type EngineMessage =
    | EngineMessageText
    | EngineMessageFile
    | EngineMessageEventEngine
    | EngineMessageEventInput
    | EngineMessageCommand
    | EngineMessageLoadProject
    | EngineMessageLoadMap;
