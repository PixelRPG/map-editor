import {
    InputEvent,
    InputEventType,
} from '../types/index';
import { isNonNullObject, hasStringProperty } from './validation';

/**
 * Check if an input event is of a specific type
 */
export const isInputEventOfType = <T extends InputEventType>(
    event: InputEvent,
    type: T
): event is InputEvent<T> => {
    return event.type === type;
};

/**
 * Check if an object is a valid input event
 * This is used for validating events received via RPC
 */
export const isValidInputEvent = (obj: unknown): obj is InputEvent => {
    if (obj === null || typeof obj !== 'object' || !('type' in obj) || !('data' in obj)) {
        return false;
    }

    const event = obj as InputEvent;

    // Check if the type is a valid InputEventType 
    // Since InputEventType is a string enum, we can check if the value exists
    return Object.values(InputEventType).includes(event.type as InputEventType);
};

/**
 * Helper for checking mouse events with position data
 */
const isMousePositionEvent = (event: InputEvent, type: InputEventType): boolean => {
    return event.type === type &&
        isNonNullObject(event.data) &&
        'x' in event.data &&
        'y' in event.data &&
        typeof event.data.x === 'number' &&
        typeof event.data.y === 'number';
};

/**
 * Check if an input event is a mouse move event
 */
export const isMouseMoveEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_MOVE> => {
    return isMousePositionEvent(event, InputEventType.MOUSE_MOVE);
};

/**
 * Check if an input event is a mouse down event
 */
export const isMouseDownEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_DOWN> => {
    return isMousePositionEvent(event, InputEventType.MOUSE_DOWN);
};

/**
 * Check if an input event is a mouse up event
 */
export const isMouseUpEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_UP> => {
    return isMousePositionEvent(event, InputEventType.MOUSE_UP);
};

/**
 * Check if an input event is a mouse enter event
 */
export const isMouseEnterEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_ENTER> => {
    return isMousePositionEvent(event, InputEventType.MOUSE_ENTER);
};

/**
 * Check if an input event is a mouse click event
 */
export const isMouseClickEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_CLICK> => {
    return isMousePositionEvent(event, InputEventType.MOUSE_CLICK);
};

/**
 * Check if an input event is a mouse leave event
 */
export const isMouseLeaveEvent = (event: InputEvent): event is InputEvent<InputEventType.MOUSE_LEAVE> => {
    return event.type === InputEventType.MOUSE_LEAVE && event.data === null;
};

/**
 * Check if an input event is a wheel event
 */
export const isWheelEvent = (event: InputEvent): event is InputEvent<InputEventType.WHEEL> => {
    return isMousePositionEvent(event, InputEventType.WHEEL) &&
        isNonNullObject(event.data) &&
        'deltaY' in event.data &&
        typeof event.data.deltaY === 'number';
};

/**
 * Check if an input event is a key event
 */
const isKeyEvent = (event: InputEvent, type: InputEventType.KEY_DOWN | InputEventType.KEY_UP): boolean => {
    return event.type === type &&
        isNonNullObject(event.data) &&
        hasStringProperty(event.data, 'key') &&
        hasStringProperty(event.data, 'code');
};

/**
 * Check if an input event is a key down event
 */
export const isKeyDownEvent = (event: InputEvent): event is InputEvent<InputEventType.KEY_DOWN> => {
    return isKeyEvent(event, InputEventType.KEY_DOWN);
};

/**
 * Check if an input event is a key up event
 */
export const isKeyUpEvent = (event: InputEvent): event is InputEvent<InputEventType.KEY_UP> => {
    return isKeyEvent(event, InputEventType.KEY_UP);
}; 