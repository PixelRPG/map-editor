import type { EngineEvent, EngineStatus } from './index.ts';

/**
 * Engine message type enum
 * Defines all the possible types of messages that can be exchanged
 */
export enum EngineMessageType {
    ENGINE_EVENT = 'engine-event',
    INPUT_EVENT = 'input-event',
    COMMAND = 'command',
    LOAD_PROJECT = 'load-project',
    LOAD_MAP = 'load-map'
}

/**
 * Base interface for all engine messages
 */
export interface EngineMessageBase {
    /**
     * Type of the message, used for routing
     */
    messageType: EngineMessageType;

    /**
     * Message payload, depends on the messageType
     */
    payload: unknown;

    /**
     * Channel name for message routing
     */
    channel?: string;
}

/**
 * Engine event message interface
 */
export interface EngineMessageEventEngine extends EngineMessageBase {
    messageType: EngineMessageType.ENGINE_EVENT;
    payload: EngineEvent;
}

/**
 * Input event message interface
 */
export interface EngineMessageEventInput extends EngineMessageBase {
    messageType: EngineMessageType.INPUT_EVENT;
    payload: unknown; // TODO: Define InputEvent interface
}

/**
 * Load project message interface
 */
export interface EngineMessageLoadProject extends EngineMessageBase {
    messageType: EngineMessageType.LOAD_PROJECT;
    payload: {
        projectPath: string;
        options?: unknown; // TODO: Define ProjectLoadOptions interface
    };
}

/**
 * Load map message interface
 */
export interface EngineMessageLoadMap extends EngineMessageBase {
    messageType: EngineMessageType.LOAD_MAP;
    payload: {
        mapId: string;
    };
}

/**
 * Command message interface
 */
export interface EngineMessageCommand extends EngineMessageBase {
    messageType: EngineMessageType.COMMAND;
    payload: {
        command: string;
    };
}

/**
 * Union type of all engine messages
 */
export type EngineMessage =
    | EngineMessageEventEngine
    | EngineMessageEventInput
    | EngineMessageLoadProject
    | EngineMessageLoadMap
    | EngineMessageCommand;

/**
 * Type guard for engine messages
 */
export function isEngineMessage(data: unknown): data is EngineMessage {
    return typeof data === 'object' &&
        data !== null &&
        'messageType' in data &&
        'payload' in data;
}

/**
 * Type guard for engine event messages
 */
export function isEngineEventMessage(data: unknown): data is EngineMessageEventEngine {
    return isEngineMessage(data) && data.messageType === EngineMessageType.ENGINE_EVENT;
}

/**
 * Type guard for input event messages
 */
export function isInputEventMessage(data: unknown): data is EngineMessageEventInput {
    return isEngineMessage(data) && data.messageType === EngineMessageType.INPUT_EVENT;
}

/**
 * Type guard for load project messages
 */
export function isLoadProjectMessage(data: unknown): data is EngineMessageLoadProject {
    return isEngineMessage(data) && data.messageType === EngineMessageType.LOAD_PROJECT;
}

/**
 * Type guard for load map messages
 */
export function isLoadMapMessage(data: unknown): data is EngineMessageLoadMap {
    return isEngineMessage(data) && data.messageType === EngineMessageType.LOAD_MAP;
}

/**
 * Type guard for command messages
 */
export function isCommandMessage(data: unknown): data is EngineMessageCommand {
    return isEngineMessage(data) && data.messageType === EngineMessageType.COMMAND;
} 