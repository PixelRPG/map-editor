import {
    EngineEvent,
    InputEvent,
    EngineEventType,
    EngineStatus,
    InputEventType
} from '../types/index.ts';

/**
 * Service for type guards for engine types
 */
class EngineTypeGuardsService {
    /**
     * Check if an event is a status changed event
     */
    isStatusChangedEvent(event: EngineEvent): event is EngineEvent<EngineEventType.STATUS_CHANGED> {
        return event.type === EngineEventType.STATUS_CHANGED &&
            typeof event.data === 'string' &&
            event.data.trim() !== '' &&
            Object.values(EngineStatus).includes(event.data as EngineStatus);
    }

    /**
     * Check if an event is a project loaded event
     */
    isProjectLoadedEvent(event: EngineEvent): event is EngineEvent<EngineEventType.PROJECT_LOADED> {
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
    isMapLoadedEvent(event: EngineEvent): event is EngineEvent<EngineEventType.MAP_LOADED> {
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
    isErrorEvent(event: EngineEvent): event is EngineEvent<EngineEventType.ERROR> {
        return event.type === EngineEventType.ERROR &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'message' in event.data &&
            typeof event.data.message === 'string';
    }

    /**
     * Check if an input event is a mouse move event
     */
    isMouseMoveEvent(event: InputEvent): event is InputEvent<InputEventType.MOUSE_MOVE> {
        return event.type === InputEventType.MOUSE_MOVE &&
            event.data !== null &&
            'position' in event.data &&
            typeof event.data.position === 'object' &&
            event.data.position !== null &&
            'x' in event.data.position &&
            'y' in event.data.position &&
            typeof event.data.position.x === 'number' &&
            typeof event.data.position.y === 'number';
    }

    /**
     * Check if an input event is a mouse down event
     */
    isMouseDownEvent(event: InputEvent): event is InputEvent<InputEventType.MOUSE_DOWN> {
        return event.type === InputEventType.MOUSE_DOWN &&
            event.data !== null &&
            'position' in event.data &&
            typeof event.data.position === 'object' &&
            event.data.position !== null &&
            'x' in event.data.position &&
            'y' in event.data.position &&
            typeof event.data.position.x === 'number' &&
            typeof event.data.position.y === 'number';
    }

    /**
     * Check if an input event is a mouse up event
     */
    isMouseUpEvent(event: InputEvent): event is InputEvent<InputEventType.MOUSE_UP> {
        return event.type === InputEventType.MOUSE_UP &&
            event.data !== null &&
            'position' in event.data &&
            typeof event.data.position === 'object' &&
            event.data.position !== null &&
            'x' in event.data.position &&
            'y' in event.data.position &&
            typeof event.data.position.x === 'number' &&
            typeof event.data.position.y === 'number';
    }

    /**
     * Check if an input event is a mouse enter event
     */
    isMouseEnterEvent(event: InputEvent): event is InputEvent<InputEventType.MOUSE_ENTER> {
        return event.type === InputEventType.MOUSE_ENTER &&
            event.data !== null &&
            'position' in event.data &&
            typeof event.data.position === 'object' &&
            event.data.position !== null &&
            'x' in event.data.position &&
            'y' in event.data.position &&
            typeof event.data.position.x === 'number' &&
            typeof event.data.position.y === 'number';
    }

    /**
     * Check if an input event is a mouse leave event
     */
    isMouseLeaveEvent(event: InputEvent): event is InputEvent<InputEventType.MOUSE_LEAVE> {
        return event.type === InputEventType.MOUSE_LEAVE &&
            event.data === null;
    }

    /**
     * Check if an input event is a wheel event
     */
    isWheelEvent(event: InputEvent): event is InputEvent<InputEventType.WHEEL> {
        return event.type === InputEventType.WHEEL &&
            event.data !== null &&
            'position' in event.data &&
            typeof event.data.position === 'object' &&
            event.data.position !== null &&
            'x' in event.data.position &&
            'y' in event.data.position &&
            typeof event.data.position.x === 'number' &&
            typeof event.data.position.y === 'number' &&
            'deltaY' in event.data &&
            typeof event.data.deltaY === 'number';
    }
}

export const engineTypeGuardsService = new EngineTypeGuardsService();