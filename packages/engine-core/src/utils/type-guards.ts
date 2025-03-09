import {
    EngineEvent,
    InputEvent,
    EngineEventType,
    EngineStatus,
    InputEventType
} from '../types/index.ts';

/**
 * Type guards for engine types
 */
export const EngineTypeGuards = {
    /**
     * Check if an event is a status changed event
     */
    isStatusChangedEvent: (event: EngineEvent): event is EngineEvent<EngineEventType.STATUS_CHANGED> => {
        return event.type === EngineEventType.STATUS_CHANGED &&
            event.data !== undefined &&
            typeof event.data === 'string' &&
            Object.values(EngineStatus).includes(event.data as EngineStatus);
    },

    /**
     * Check if an event is a project loaded event
     */
    isProjectLoadedEvent: (event: EngineEvent): event is EngineEvent<EngineEventType.PROJECT_LOADED> => {
        return event.type === EngineEventType.PROJECT_LOADED &&
            event.data !== undefined &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'projectId' in event.data;
    },

    /**
     * Check if an event is a map loaded event
     */
    isMapLoadedEvent: (event: EngineEvent): event is EngineEvent<EngineEventType.MAP_LOADED> => {
        return event.type === EngineEventType.MAP_LOADED &&
            event.data !== undefined &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'mapId' in event.data;
    },

    /**
     * Check if an event is an error event
     */
    isErrorEvent: (event: EngineEvent): event is EngineEvent<EngineEventType.ERROR> => {
        return event.type === EngineEventType.ERROR &&
            event.data !== undefined &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'message' in event.data;
    },

    /**
     * Check if an input event is a mouse move event
     */
    isMouseMoveEvent: (event: InputEvent): event is InputEvent<InputEventType.MOUSE_MOVE> => {
        return event.type === InputEventType.MOUSE_MOVE &&
            event.data !== null &&
            'position' in event.data;
    },

    /**
     * Check if an input event is a mouse down event
     */
    isMouseDownEvent: (event: InputEvent): event is InputEvent<InputEventType.MOUSE_DOWN> => {
        return event.type === InputEventType.MOUSE_DOWN &&
            event.data !== null &&
            'position' in event.data;
    },

    /**
     * Check if an input event is a mouse up event
     */
    isMouseUpEvent: (event: InputEvent): event is InputEvent<InputEventType.MOUSE_UP> => {
        return event.type === InputEventType.MOUSE_UP &&
            event.data !== null &&
            'position' in event.data;
    },

    /**
     * Check if an input event is a mouse enter event
     */
    isMouseEnterEvent: (event: InputEvent): event is InputEvent<InputEventType.MOUSE_ENTER> => {
        return event.type === InputEventType.MOUSE_ENTER &&
            event.data !== null &&
            'position' in event.data;
    },

    /**
     * Check if an input event is a mouse leave event
     */
    isMouseLeaveEvent: (event: InputEvent): event is InputEvent<InputEventType.MOUSE_LEAVE> => {
        return event.type === InputEventType.MOUSE_LEAVE &&
            event.data === null;
    },

    /**
     * Check if an input event is a wheel event
     */
    isWheelEvent: (event: InputEvent): event is InputEvent<InputEventType.WHEEL> => {
        return event.type === InputEventType.WHEEL &&
            event.data !== null &&
            'position' in event.data &&
            'deltaY' in event.data;
    }
}; 