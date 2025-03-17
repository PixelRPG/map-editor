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