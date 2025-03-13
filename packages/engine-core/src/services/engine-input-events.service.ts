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
     * @param position Position with x, y coordinates or separate x, y parameters
     * @param dragDelta Optional drag delta information
     */
    mouseMove(position: { x: number, y: number } | number, y?: number, dragDeltaX?: number, dragDeltaY?: number): InputEvent<InputEventType.MOUSE_MOVE> {
        let x: number;

        // Handle different parameter formats
        if (typeof position === 'object') {
            // Position object provided
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
                throw this.errorService.createValidationError('Invalid position for mouse move event');
            }
            x = position.x;
            y = position.y;
        } else if (typeof position === 'number' && typeof y === 'number') {
            // x, y coordinates provided separately
            x = position;
        } else {
            throw this.errorService.createValidationError('Invalid coordinates for mouse move event');
        }

        // Validate dragDelta if provided
        if ((dragDeltaX !== undefined && typeof dragDeltaX !== 'number') ||
            (dragDeltaY !== undefined && typeof dragDeltaY !== 'number')) {
            throw this.errorService.createValidationError('Invalid dragDelta for mouse move event');
        }

        return {
            type: InputEventType.MOUSE_MOVE,
            data: {
                x,
                y,
                ...(dragDeltaX !== undefined && dragDeltaY !== undefined ? {
                    deltaX: dragDeltaX,
                    deltaY: dragDeltaY
                } : {})
            }
        };
    }

    /**
     * Create a mouse down event
     * @param position Position with x, y coordinates or separate x, y parameters
     * @param button Mouse button (default: 0 = left button)
     */
    mouseDown(position: { x: number, y: number } | number, yOrButton?: number, button: number = 0): InputEvent<InputEventType.MOUSE_DOWN> {
        let x: number;
        let y: number;

        // Handle different parameter formats
        if (typeof position === 'object') {
            // Position object provided
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
                throw this.errorService.createValidationError('Invalid position for mouse down event');
            }
            x = position.x;
            y = position.y;
            // In this case, yOrButton is actually the button
            if (yOrButton !== undefined) {
                button = yOrButton;
            }
        } else if (typeof position === 'number' && typeof yOrButton === 'number') {
            // x, y coordinates provided separately
            x = position;
            y = yOrButton;
        } else {
            throw this.errorService.createValidationError('Invalid coordinates for mouse down event');
        }

        // Validate button
        if (typeof button !== 'number' || button < 0) {
            throw this.errorService.createValidationError('Invalid button for mouse down event');
        }

        return {
            type: InputEventType.MOUSE_DOWN,
            data: {
                x,
                y,
                button
            }
        };
    }

    /**
     * Create a mouse up event
     * @param position Position with x, y coordinates or separate x, y parameters
     * @param button Mouse button (default: 0 = left button)
     */
    mouseUp(position: { x: number, y: number } | number, yOrButton?: number, button: number = 0): InputEvent<InputEventType.MOUSE_UP> {
        let x: number;
        let y: number;

        // Handle different parameter formats
        if (typeof position === 'object') {
            // Position object provided
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
                throw this.errorService.createValidationError('Invalid position for mouse up event');
            }
            x = position.x;
            y = position.y;
            // In this case, yOrButton is actually the button
            if (yOrButton !== undefined) {
                button = yOrButton;
            }
        } else if (typeof position === 'number' && typeof yOrButton === 'number') {
            // x, y coordinates provided separately
            x = position;
            y = yOrButton;
        } else {
            throw this.errorService.createValidationError('Invalid coordinates for mouse up event');
        }

        // Validate button
        if (typeof button !== 'number' || button < 0) {
            throw this.errorService.createValidationError('Invalid button for mouse up event');
        }

        return {
            type: InputEventType.MOUSE_UP,
            data: {
                x,
                y,
                button
            }
        };
    }

    /**
     * Create a mouse enter event
     * @param position Position with x, y coordinates or separate x, y parameters
     */
    mouseEnter(position: { x: number, y: number } | number, y?: number): InputEvent<InputEventType.MOUSE_ENTER> {
        let x: number;

        // Handle different parameter formats
        if (typeof position === 'object') {
            // Position object provided
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
                throw this.errorService.createValidationError('Invalid position for mouse enter event');
            }
            x = position.x;
            y = position.y;
        } else if (typeof position === 'number' && typeof y === 'number') {
            // x, y coordinates provided separately
            x = position;
        } else {
            throw this.errorService.createValidationError('Invalid coordinates for mouse enter event');
        }

        return {
            type: InputEventType.MOUSE_ENTER,
            data: {
                x,
                y
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
     * @param position Position with x, y coordinates or separate x, y parameters
     * @param deltaY Wheel delta Y
     */
    wheel(position: { x: number, y: number } | number, yOrDeltaY: number, deltaY?: number): InputEvent<InputEventType.WHEEL> {
        let x: number;
        let y: number;
        let actualDeltaY: number;

        // Handle different parameter formats
        if (typeof position === 'object') {
            // Position object provided
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
                throw this.errorService.createValidationError('Invalid position for wheel event');
            }
            x = position.x;
            y = position.y;
            // In this case, yOrDeltaY is actually the deltaY
            actualDeltaY = yOrDeltaY;
        } else if (typeof position === 'number' && typeof yOrDeltaY === 'number' && typeof deltaY === 'number') {
            // x, y, deltaY coordinates provided separately
            x = position;
            y = yOrDeltaY;
            actualDeltaY = deltaY;
        } else {
            throw this.errorService.createValidationError('Invalid parameters for wheel event');
        }

        // Validate deltaY
        if (typeof actualDeltaY !== 'number') {
            throw this.errorService.createValidationError('Invalid deltaY for wheel event');
        }

        return {
            type: InputEventType.WHEEL,
            data: {
                x,
                y,
                deltaY: actualDeltaY
            }
        };
    }
}

export const engineInputEventsService = new EngineInputEventsService();