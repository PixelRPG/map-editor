import {
    EngineMessageType,
    EngineMessage,
    EngineMessageEventEngine,
    EngineMessageEventInput,
    EngineMessageCommand,
    EngineMessageLoadProject,
    EngineMessageLoadMap,
    EngineEvent,
    EngineEventType
} from '../types/index';
import { isNonNullObject, hasStringProperty, hasNonEmptyStringProperty } from './validation';

/**
 * Check if a message is an engine message
 */
export const isEngineMessage = (message: unknown): message is EngineMessage => {
    if (!isNonNullObject(message) || !hasStringProperty(message, 'messageType')) {
        return false;
    }

    return Object.values(EngineMessageType).includes(message.messageType as EngineMessageType);
};

/**
 * Check if a message is of a specific engine message type
 */
export const isEngineMessageOfType = <T extends EngineMessageType>(
    message: unknown,
    messageType: T
): message is { messageType: T; payload: unknown } => {
    return isEngineMessage(message) && message.messageType === messageType;
};

/**
 * Check if a message is an engine event message
 */
export const isEngineEventMessage = (message: unknown): message is EngineMessageEventEngine => {
    return isEngineMessageOfType(message, EngineMessageType.ENGINE_EVENT) &&
        isNonNullObject(message.payload) &&
        hasStringProperty(message.payload, 'type');
};

/**
 * Check if a message is an engine event message of a specific type
 */
export const isEngineEventMessageOfType = <T extends EngineEventType>(
    message: unknown,
    eventType: T
): message is EngineMessageEventEngine & { payload: EngineEvent<T> } => {
    return isEngineEventMessage(message) && message.payload.type === eventType;
};

/**
 * Check if a message is an input event message
 */
export const isInputEventMessage = (message: unknown): message is EngineMessageEventInput => {
    return isEngineMessageOfType(message, EngineMessageType.INPUT_EVENT) &&
        isNonNullObject(message.payload) &&
        hasStringProperty(message.payload, 'type');
};

/**
 * Check if a message is a command message
 */
export const isCommandMessage = (message: unknown): message is EngineMessageCommand => {
    return isEngineMessageOfType(message, EngineMessageType.COMMAND) &&
        isNonNullObject(message.payload) &&
        hasStringProperty(message.payload, 'command');
};

/**
 * Check if a message is a load project message
 */
export const isLoadProjectMessage = (message: unknown): message is EngineMessageLoadProject => {
    return isEngineMessageOfType(message, EngineMessageType.LOAD_PROJECT) &&
        isNonNullObject(message.payload) &&
        hasNonEmptyStringProperty(message.payload, 'projectPath');
};

/**
 * Check if a message is a load map message
 */
export const isLoadMapMessage = (message: unknown): message is EngineMessageLoadMap => {
    return isEngineMessageOfType(message, EngineMessageType.LOAD_MAP) &&
        isNonNullObject(message.payload) &&
        hasNonEmptyStringProperty(message.payload, 'mapId');
}; 