import { InputEventType } from './input-event-type';
import { MouseEventData, MouseMoveEventData, WheelEventData } from './mouse-event-data';
import { KeyEventData } from './key-event-data';

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