import {
    InputEvent,
    InputEventType,
    Position
} from '../types/index.ts';
import { errorService } from './error.service.ts';

/**
 * Service for creating properly typed input events
 */
class EngineInputEventsService {

    private errorService = errorService;

    /**
     * Create a mouse move event
     */
    mouseMove(position: Position, dragDelta?: Position): InputEvent<InputEventType.MOUSE_MOVE> {
        // Validate position
        if (!position || typeof position !== 'object' ||
            typeof position.x !== 'number' || typeof position.y !== 'number') {
            throw this.errorService.createValidationError('Invalid position for mouse move event');
        }

        // Validate dragDelta if provided
        if (dragDelta !== undefined && (typeof dragDelta !== 'object' ||
            typeof dragDelta.x !== 'number' || typeof dragDelta.y !== 'number')) {
            throw this.errorService.createValidationError('Invalid dragDelta for mouse move event');
        }

        return {
            type: InputEventType.MOUSE_MOVE,
            data: {
                position,
                ...(dragDelta ? { dragDelta } : {})
            }
        };
    }

    /**
     * Create a mouse down event
     */
    mouseDown(position: Position, button: number = 0): InputEvent<InputEventType.MOUSE_DOWN> {
        // Validate position
        if (!position || typeof position !== 'object' ||
            typeof position.x !== 'number' || typeof position.y !== 'number') {
            throw this.errorService.createValidationError('Invalid position for mouse down event');
        }

        // Validate button
        if (typeof button !== 'number' || button < 0) {
            throw this.errorService.createValidationError('Invalid button for mouse down event');
        }

        return {
            type: InputEventType.MOUSE_DOWN,
            data: {
                position,
                button
            }
        };
    }

    /**
     * Create a mouse up event
     */
    mouseUp(position: Position, button: number = 0): InputEvent<InputEventType.MOUSE_UP> {
        // Validate position
        if (!position || typeof position !== 'object' ||
            typeof position.x !== 'number' || typeof position.y !== 'number') {
            throw this.errorService.createValidationError('Invalid position for mouse up event');
        }

        // Validate button
        if (typeof button !== 'number' || button < 0) {
            throw this.errorService.createValidationError('Invalid button for mouse up event');
        }

        return {
            type: InputEventType.MOUSE_UP,
            data: {
                position,
                button
            }
        };
    }

    /**
     * Create a mouse enter event
     */
    mouseEnter(position: Position): InputEvent<InputEventType.MOUSE_ENTER> {
        // Validate position
        if (!position || typeof position !== 'object' ||
            typeof position.x !== 'number' || typeof position.y !== 'number') {
            throw this.errorService.createValidationError('Invalid position for mouse enter event');
        }

        return {
            type: InputEventType.MOUSE_ENTER,
            data: {
                position
            }
        };
    }

    /**
     * Create a mouse leave event
     * No position data is needed for mouse leave events
     */
    mouseLeave(): InputEvent<InputEventType.MOUSE_LEAVE> {
        return {
            type: InputEventType.MOUSE_LEAVE,
            data: null
        };
    }

    /**
     * Create a wheel event
     */
    wheel(position: Position, deltaY: number): InputEvent<InputEventType.WHEEL> {
        // Validate position
        if (!position || typeof position !== 'object' ||
            typeof position.x !== 'number' || typeof position.y !== 'number') {
            throw this.errorService.createValidationError('Invalid position for wheel event');
        }

        // Validate deltaY
        if (typeof deltaY !== 'number') {
            throw this.errorService.createValidationError('Invalid deltaY for wheel event');
        }

        return {
            type: InputEventType.WHEEL,
            data: {
                position,
                deltaY
            }
        };
    }
}

export const engineInputEventsService = new EngineInputEventsService();