/**
 * Position in the game world
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Base mouse event data
 */
export interface MouseEventData {
    position: Position;
    button?: number;
}

/**
 * Mouse move event data with optional drag information
 */
export interface MouseMoveEventData extends MouseEventData {
    dragDelta?: Position;
}

/**
 * Wheel event data
 */
export interface WheelEventData extends MouseEventData {
    deltaY: number;
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
    WHEEL = 'wheel',
}

/**
 * Type mapping for input event data based on event type
 */
export interface InputEventDataMap {
    [InputEventType.MOUSE_MOVE]: MouseMoveEventData;
    [InputEventType.MOUSE_DOWN]: MouseEventData;
    [InputEventType.MOUSE_UP]: MouseEventData;
    [InputEventType.MOUSE_ENTER]: MouseEventData;
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