/**
 * Position in the game world
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Input event types
 */
export enum InputEventType {
    MOUSE_MOVE = 'mouse-move',
    MOUSE_DOWN = 'mouse-down',
    MOUSE_UP = 'mouse-up',
    MOUSE_ENTER = 'mouse-enter',
    MOUSE_LEAVE = 'mouse-leave',
    MOUSE_CLICK = 'mouse-click',
    KEY_DOWN = 'key-down',
    KEY_UP = 'key-up',
    WHEEL = 'wheel',
}

/**
 * Base mouse event data with x/y coordinates
 */
export interface MouseEventData {
    x: number;
    y: number;
    button?: number;
}

/**
 * Mouse move event data with optional drag information
 */
export interface MouseMoveEventData extends MouseEventData {
    deltaX?: number;
    deltaY?: number;
}

/**
 * Wheel event data
 */
export interface WheelEventData extends MouseEventData {
    deltaY: number;
}

/**
 * Key event data
 */
export interface KeyEventData {
    key: string;
    code: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
}

/**
 * Type mapping for input event data based on event type
 */
export interface InputEventDataMap {
    [InputEventType.MOUSE_MOVE]: MouseMoveEventData;
    [InputEventType.MOUSE_DOWN]: MouseEventData;
    [InputEventType.MOUSE_UP]: MouseEventData;
    [InputEventType.MOUSE_ENTER]: MouseEventData;
    [InputEventType.MOUSE_CLICK]: MouseEventData;
    [InputEventType.KEY_DOWN]: KeyEventData;
    [InputEventType.KEY_UP]: KeyEventData;
    [InputEventType.WHEEL]: WheelEventData;
    [InputEventType.MOUSE_LEAVE]: null;
}

/**
 * Generic input event with typed data based on event type
 */
export interface InputEvent<T extends InputEventType = InputEventType> {
    type: T;
    data: InputEventDataMap[T];
} 