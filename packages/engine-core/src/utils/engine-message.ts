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
    EngineStatus,
    InputEventType,
    InputEvent,
} from '../types/index.ts';


/**
 * Check if a message is an engine message
 */
export const isEngineMessage = (message: unknown): message is EngineMessage => {
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
export const isEngineEventMessage = (message: unknown): message is EngineMessageEventEngine => {
    return isEngineMessage(message) &&
        message.messageType === EngineMessageType.ENGINE_EVENT &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'type' in message.payload &&
        typeof message.payload.type === 'string';
}

export const isEngineEventMessageOfType = <T extends EngineEventType>(message: unknown, eventType: T): message is EngineEvent<T> => {
    return isEngineEventMessage(message) &&
        message.payload.type === eventType;
}

/**
 * Check if a message is an input event message
 */
export const isInputEventMessage = (message: unknown): message is EngineMessageEventInput => {
    return isEngineMessage(message) &&
        message.messageType === EngineMessageType.INPUT_EVENT &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'type' in message.payload &&
        typeof message.payload.type === 'string';
}

/**
 * Check if a message is a command message
 */
export const isCommandMessage = (message: unknown): message is EngineMessageCommand => {
    return isEngineMessage(message) &&
        message.messageType === EngineMessageType.COMMAND &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'command' in message.payload &&
        typeof message.payload.command === 'string';
}

/**
 * Check if a message is a load project message
 */
export const isLoadProjectMessage = (message: unknown): message is EngineMessageLoadProject => {
    return isEngineMessage(message) &&
        message.messageType === EngineMessageType.LOAD_PROJECT &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'projectPath' in message.payload &&
        typeof message.payload.projectPath === 'string';
}

/**
 * Check if a message is a load map message
 */
export const isLoadMapMessage = (message: unknown): message is EngineMessageLoadMap => {
    return isEngineMessage(message) &&
        message.messageType === EngineMessageType.LOAD_MAP &&
        typeof message.payload === 'object' &&
        message.payload !== null &&
        'mapId' in message.payload &&
        typeof message.payload.mapId === 'string';
}

/**
 * Get the event type from an event message
 */
export const getEventType = (message: EngineMessageEventEngine): EngineEventType => {
    return message.payload.type as EngineEventType;
}

/**
 * Get the event data from an event message
 */
export const getEventData = <T extends EngineEventType>(message: EngineMessageEventEngine): EngineEventDataMap[T] => {
    return message.payload.data as EngineEventDataMap[T];
}

/**
    * Check if an event is a status changed event
*/
export const isStatusChangedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.STATUS_CHANGED> => {
    return event.type === EngineEventType.STATUS_CHANGED &&
        typeof event.data === 'string' &&
        event.data.trim() !== '' &&
        Object.values(EngineStatus).includes(event.data as EngineStatus);
}

/**
 * Check if an event is a project loaded event
 */
export const isProjectLoadedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.PROJECT_LOADED> => {
    return event.type === EngineEventType.PROJECT_LOADED &&
        typeof event.data === 'object' &&
        event.data !== null &&
        'projectId' in event.data &&
        typeof event.data.projectId === 'string' &&
        event.data.projectId.trim() !== '';
}

/**
 * Check if an event is a map loaded event
 */
export const isMapLoadedEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.MAP_LOADED> => {
    return event.type === EngineEventType.MAP_LOADED &&
        typeof event.data === 'object' &&
        event.data !== null &&
        'mapId' in event.data &&
        typeof event.data.mapId === 'string' &&
        event.data.mapId.trim() !== '';
}

/**
 * Check if an event is an error event
 */
export const isErrorEvent = (event: EngineEvent): event is EngineEvent<EngineEventType.ERROR> => {
    return event.type === EngineEventType.ERROR &&
        typeof event.data === 'object' &&
        event.data !== null &&
        'message' in event.data &&
        typeof event.data.message === 'string';
}

/**
 * Check if an input event is a mouse move event
 */
export const isMouseMoveEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_MOVE> => {
    return event.type === InputEventType.MOUSE_MOVE &&
        event.data !== null &&
        typeof event.data === 'object' &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number';
}

/**
 * Check if an input event is a mouse down event
 */
export const isMouseDownEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_DOWN> => {
    return event.type === InputEventType.MOUSE_DOWN &&
        event.data !== null &&
        typeof event.data === 'object' &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number';
}

/**
 * Check if an input event is a mouse up event
 */
export const isMouseUpEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_UP> => {
    return event.type === InputEventType.MOUSE_UP &&
        event.data !== null &&
        typeof event.data === 'object' &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number';
}

/**
 * Check if an input event is a mouse enter event
 */
export const isMouseEnterEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_ENTER> => {
    return event.type === InputEventType.MOUSE_ENTER &&
        event.data !== null &&
        typeof event.data === 'object' &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number';
}

/**
 * Check if an input event is a mouse leave event
 */
export const isMouseLeaveEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_LEAVE> => {
    return event.type === InputEventType.MOUSE_LEAVE &&
        event.data === null;
}

/**
 * Check if an input event is a wheel event
 */
export const isWheelEvent = (event: InputEvent): event is InputEvent<InputEventType.WHEEL> => {
    return event.type === InputEventType.WHEEL &&
        event.data !== null &&
        typeof event.data === 'object' &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number' &&
        'deltaY' in event.data &&
        typeof event.data.deltaY === 'number';
}