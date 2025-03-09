import {
    EngineEvent,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    EngineEventType,
    EngineMessageType,
    EngineCommandType,
    EngineMessage,
    EngineMessageEventEngine,
    EngineMessageEventInput,
    EngineMessageCommand,
    EngineMessageLoadProject,
    EngineMessageLoadMap,
    EngineMessageText,
    EngineMessageFile,
    EngineMessageEvent
} from '../types/index.ts';
import { errorService } from './error.service.ts';

/**
 * Service for creating properly typed engine messages
 */
class EngineMessagesService {
    private errorService = errorService;

    /**
     * Create an input event message
     */
    inputEvent(inputEvent: InputEvent): EngineMessageEventInput {
        // Validate input event before creating message
        if (!inputEvent || !inputEvent.type) {
            throw this.errorService.createValidationError('Invalid input event: missing type');
        }

        if (!Object.values(InputEventType).includes(inputEvent.type)) {
            throw this.errorService.createValidationError(`Invalid input event type: ${inputEvent.type}`);
        }

        return {
            type: 'event',
            data: {
                name: EngineMessageType.INPUT_EVENT,
                data: inputEvent
            }
        };
    }

    /**
     * Create an engine event message
     */
    engineEvent(engineEvent: EngineEvent): EngineMessageEventEngine {
        // Validate event before creating message
        if (!engineEvent || !engineEvent.type) {
            throw this.errorService.createValidationError('Invalid engine event: missing type');
        }

        if (!Object.values(EngineEventType).includes(engineEvent.type)) {
            throw this.errorService.createValidationError(`Invalid engine event type: ${engineEvent.type}`);
        }

        return {
            type: 'event',
            data: {
                name: EngineMessageType.ENGINE_EVENT,
                data: engineEvent
            }
        };
    }

    /**
     * Create a command message
     */
    command(command: EngineCommandType): EngineMessageCommand {
        // Validate command before creating message
        if (!Object.values(EngineCommandType).includes(command)) {
            throw this.errorService.createValidationError(`Invalid command type: ${command}`);
        }

        return {
            type: 'command',
            data: {
                command
            }
        };
    }

    /**
     * Create a load project message
     */
    loadProject(projectPath: string, options?: ProjectLoadOptions): EngineMessageLoadProject {
        // Validate project path before creating message
        if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
            throw this.errorService.createValidationError('Invalid project path');
        }

        return {
            type: EngineMessageType.LOAD_PROJECT,
            data: {
                projectPath,
                options
            }
        };
    }

    /**
     * Create a load map message
     */
    loadMap(mapId: string): EngineMessageLoadMap {
        // Validate map ID before creating message
        if (!mapId || typeof mapId !== 'string' || mapId.trim() === '') {
            throw this.errorService.createValidationError('Invalid map ID');
        }

        return {
            type: EngineMessageType.LOAD_MAP,
            data: {
                mapId
            }
        };
    }

    /**
     * Create a text message
     */
    text(text: string): EngineMessageText {
        return {
            type: 'text',
            data: text
        };
    }

    /**
     * Create a file message
     */
    file(filePath: string, fileData: string | ArrayBuffer): EngineMessageFile {
        return {
            type: 'file',
            data: {
                path: filePath,
                data: fileData
            }
        };
    }
}

/**
 * Service for parsing engine messages
 */
export class EngineMessageParserService {
    /**
     * Check if a message is an engine message
     */
    isEngineMessage(message: unknown): message is EngineMessage {
        if (message === null || typeof message !== 'object' || !('type' in message)) {
            return false;
        }

        const type = (message as { type: string }).type;
        return type === 'text' ||
            type === 'file' ||
            type === 'event' ||
            type === 'command' ||
            type === EngineMessageType.LOAD_PROJECT ||
            type === EngineMessageType.LOAD_MAP;
    }

    /**
     * Check if a message is a text message
     */
    isTextMessage(message: unknown): message is EngineMessageText {
        return this.isEngineMessage(message) &&
            message.type === 'text' &&
            typeof message.data === 'string';
    }

    /**
     * Check if a message is a file message
     */
    isFileMessage(message: unknown): message is EngineMessageFile {
        return this.isEngineMessage(message) &&
            message.type === 'file' &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'path' in message.data &&
            typeof message.data.path === 'string' &&
            'data' in message.data &&
            (typeof message.data.data === 'string' || message.data.data instanceof ArrayBuffer);
    }

    /**
     * Check if a message is an event message
     */
    isEventMessage(message: unknown): message is EngineMessageEvent<string, unknown> {
        return this.isEngineMessage(message) &&
            message.type === 'event' &&
            'data' in message &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'name' in message.data &&
            typeof message.data.name === 'string' &&
            'data' in message.data;
    }

    /**
     * Check if a message is an engine event message
     */
    isEngineEventMessage(message: unknown): message is EngineMessageEventEngine {
        return this.isEventMessage(message) &&
            message.data.name === EngineMessageType.ENGINE_EVENT &&
            typeof message.data.data === 'object' &&
            message.data.data !== null &&
            'type' in message.data.data &&
            typeof message.data.data.type === 'string';
    }

    /**
     * Check if a message is an input event message
     */
    isInputEventMessage(message: unknown): message is EngineMessageEventInput {
        return this.isEventMessage(message) &&
            message.data.name === EngineMessageType.INPUT_EVENT &&
            typeof message.data.data === 'object' &&
            message.data.data !== null &&
            'type' in message.data.data &&
            typeof message.data.data.type === 'string';
    }

    /**
     * Check if a message is a command message
     */
    isCommandMessage(message: unknown): message is EngineMessageCommand {
        return this.isEngineMessage(message) &&
            message.type === 'command' &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'command' in message.data &&
            typeof message.data.command === 'string';
    }

    /**
     * Check if a message is a load project message
     */
    isLoadProjectMessage(message: unknown): message is EngineMessageLoadProject {
        return this.isEngineMessage(message) &&
            message.type === EngineMessageType.LOAD_PROJECT &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'projectPath' in message.data &&
            typeof message.data.projectPath === 'string';
    }

    /**
     * Check if a message is a load map message
     */
    isLoadMapMessage(message: unknown): message is EngineMessageLoadMap {
        return this.isEngineMessage(message) &&
            message.type === EngineMessageType.LOAD_MAP &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'mapId' in message.data &&
            typeof message.data.mapId === 'string';
    }

    /**
     * Get the event type from an event message
     */
    getEventType(message: EngineMessageEvent<string, unknown>): string {
        return message.data.name;
    }

    /**
     * Get the event data from an event message
     */
    getEventData<T>(message: EngineMessageEvent<string, T>): T {
        return message.data.data;
    }
}

export const engineMessagesService = new EngineMessagesService();
export const engineMessageParserService = new EngineMessageParserService();