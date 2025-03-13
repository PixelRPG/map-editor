import {
    EngineMessageType,
    EngineMessage,
    EngineMessageEventEngine,
    EngineMessageEventInput,
    EngineMessageCommand,
    EngineMessageLoadProject,
    EngineMessageLoadMap,
    EngineEventDataMap,
    EngineEventType,
    EngineEvent,
} from '../types/index.ts';


/**
 * Service for parsing engine messages
 */
export class EngineMessageParserService {
    /**
     * Check if a message is an engine message
     */
    isEngineMessage(message: unknown): message is EngineMessage {
        if (message === null || typeof message !== 'object' || !('messageType' in message)) {
            return false;
        }

        const messageType = (message as { messageType: string }).messageType;
        return messageType === EngineMessageType.COMMAND ||
            messageType === EngineMessageType.ENGINE_EVENT ||
            messageType === EngineMessageType.INPUT_EVENT ||
            messageType === EngineMessageType.LOAD_MAP ||
            messageType === EngineMessageType.LOAD_PROJECT;
    }

    /**
     * Check if a message is an engine event message
     */
    isEngineEventMessage(message: unknown): message is EngineMessageEventEngine {
        return this.isEngineMessage(message) &&
            message.messageType === EngineMessageType.ENGINE_EVENT &&
            typeof message.payload === 'object' &&
            message.payload !== null &&
            'type' in message.payload &&
            typeof message.payload.type === 'string';
    }

    isEngineEventMessageOfType<T extends EngineEventType>(message: unknown, eventType: T): message is EngineEvent<T> {
        return this.isEngineEventMessage(message) &&
            message.payload.type === eventType;
    }

    /**
     * Check if a message is an input event message
     */
    isInputEventMessage(message: unknown): message is EngineMessageEventInput {
        return this.isEngineMessage(message) &&
            message.messageType === EngineMessageType.INPUT_EVENT &&
            typeof message.payload === 'object' &&
            message.payload !== null &&
            'type' in message.payload &&
            typeof message.payload.type === 'string';
    }

    /**
     * Check if a message is a command message
     */
    isCommandMessage(message: unknown): message is EngineMessageCommand {
        return this.isEngineMessage(message) &&
            message.messageType === EngineMessageType.COMMAND &&
            typeof message.payload === 'object' &&
            message.payload !== null &&
            'command' in message.payload &&
            typeof message.payload.command === 'string';
    }

    /**
     * Check if a message is a load project message
     */
    isLoadProjectMessage(message: unknown): message is EngineMessageLoadProject {
        return this.isEngineMessage(message) &&
            message.messageType === EngineMessageType.LOAD_PROJECT &&
            typeof message.payload === 'object' &&
            message.payload !== null &&
            'projectPath' in message.payload &&
            typeof message.payload.projectPath === 'string';
    }

    /**
     * Check if a message is a load map message
     */
    isLoadMapMessage(message: unknown): message is EngineMessageLoadMap {
        return this.isEngineMessage(message) &&
            message.messageType === EngineMessageType.LOAD_MAP &&
            typeof message.payload === 'object' &&
            message.payload !== null &&
            'mapId' in message.payload &&
            typeof message.payload.mapId === 'string';
    }

    /**
     * Get the event type from an event message
     */
    getEventType(message: EngineMessageEventEngine): EngineEventType {
        return message.payload.type as EngineEventType;
    }

    /**
     * Get the event data from an event message
     */
    getEventData<T extends EngineEventType>(message: EngineMessageEventEngine): EngineEventDataMap[T] {
        return message.payload.data as EngineEventDataMap[T];
    }
}

export const engineMessageParserService = new EngineMessageParserService();