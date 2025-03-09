import {
    EngineEvent,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    Position,
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

/**
 * Helper functions to create properly typed messages
 */
export const createEngineMessages = {
    /**
     * Create an input event message
     */
    inputEvent: (inputEvent: InputEvent): EngineMessageEventInput => ({
        type: 'event',
        data: {
            name: EngineMessageType.INPUT_EVENT,
            data: inputEvent
        }
    }),

    /**
     * Create an engine event message
     */
    engineEvent: (engineEvent: EngineEvent): EngineMessageEventEngine => ({
        type: 'event',
        data: {
            name: EngineMessageType.ENGINE_EVENT,
            data: engineEvent
        }
    }),

    /**
     * Create a command message
     */
    command: (command: EngineCommandType): EngineMessageCommand => ({
        type: 'command',
        data: {
            command
        }
    }),

    /**
     * Create a load project message
     */
    loadProject: (projectPath: string, options?: ProjectLoadOptions): EngineMessageLoadProject => ({
        type: EngineMessageType.LOAD_PROJECT,
        data: {
            projectPath,
            options
        }
    }),

    /**
     * Create a load map message
     */
    loadMap: (mapId: string): EngineMessageLoadMap => ({
        type: EngineMessageType.LOAD_MAP,
        data: {
            mapId
        }
    })
};

/**
 * Helper functions to parse engine messages
 */
export const parseEngineMessages = {
    /**
     * Check if a message is an engine message
     */
    isEngineMessage: (message: unknown): message is EngineMessage => {
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
    },

    /**
     * Check if a message is a text message
     */
    isTextMessage: (message: unknown): message is EngineMessageText => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === 'text';
    },

    /**
     * Check if a message is a file message
     */
    isFileMessage: (message: unknown): message is EngineMessageFile => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === 'file';
    },

    /**
     * Check if a message is an event message
     */
    isEventMessage: (message: unknown): message is EngineMessageEvent<string, unknown> => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === 'event' &&
            'data' in message &&
            typeof message.data === 'object' &&
            message.data !== null &&
            'name' in message.data;
    },

    /**
     * Check if a message is an engine event message
     */
    isEngineEventMessage: (message: unknown): message is EngineMessageEventEngine => {
        return parseEngineMessages.isEventMessage(message) &&
            message.data.name === EngineMessageType.ENGINE_EVENT;
    },

    /**
     * Check if a message is an input event message
     */
    isInputEventMessage: (message: unknown): message is EngineMessageEventInput => {
        return parseEngineMessages.isEventMessage(message) &&
            message.data.name === EngineMessageType.INPUT_EVENT;
    },

    /**
     * Check if a message is a command message
     */
    isCommandMessage: (message: unknown): message is EngineMessageCommand => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === 'command';
    },

    /**
     * Check if a message is a load project message
     */
    isLoadProjectMessage: (message: unknown): message is EngineMessageLoadProject => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === EngineMessageType.LOAD_PROJECT;
    },

    /**
     * Check if a message is a load map message
     */
    isLoadMapMessage: (message: unknown): message is EngineMessageLoadMap => {
        return parseEngineMessages.isEngineMessage(message) &&
            message.type === EngineMessageType.LOAD_MAP;
    },

    /**
     * Get the event type from an event message
     */
    getEventType: (message: EngineMessageEvent<string, unknown>): string => {
        return message.data.name;
    },

    /**
     * Get the event data from an event message
     */
    getEventData: <T>(message: EngineMessageEvent<string, T>): T => {
        return message.data.data;
    }
};

/**
 * Helper functions to create properly typed input events
 */
export const createInputEvents = {
    /**
     * Create a mouse move event
     */
    mouseMove: (position: Position, dragDelta?: Position): InputEvent<InputEventType.MOUSE_MOVE> => ({
        type: InputEventType.MOUSE_MOVE,
        data: {
            position,
            ...(dragDelta ? { dragDelta } : {})
        }
    }),

    /**
     * Create a mouse down event
     */
    mouseDown: (position: Position, button: number = 0): InputEvent<InputEventType.MOUSE_DOWN> => ({
        type: InputEventType.MOUSE_DOWN,
        data: {
            position,
            button
        }
    }),

    /**
     * Create a mouse up event
     */
    mouseUp: (position: Position, button: number = 0): InputEvent<InputEventType.MOUSE_UP> => ({
        type: InputEventType.MOUSE_UP,
        data: {
            position,
            button
        }
    }),

    /**
     * Create a mouse enter event
     */
    mouseEnter: (position: Position): InputEvent<InputEventType.MOUSE_ENTER> => ({
        type: InputEventType.MOUSE_ENTER,
        data: {
            position
        }
    }),

    /**
     * Create a mouse leave event
     * No position data is needed for mouse leave events
     */
    mouseLeave: (): InputEvent<InputEventType.MOUSE_LEAVE> => ({
        type: InputEventType.MOUSE_LEAVE,
        data: null
    }),

    /**
     * Create a wheel event
     */
    wheel: (position: Position, deltaY: number): InputEvent<InputEventType.WHEEL> => ({
        type: InputEventType.WHEEL,
        data: {
            position,
            deltaY
        }
    })
}; 