import { Engine, System, World, Scene, SystemType } from "excalibur";
import {
    InputEventType,
    EngineMessageType,
    InputEvent,
    isInputEventMessage,
    isEngineMessage,
    isMouseMoveEvent,
    isMouseDownEvent,
    isMouseUpEvent,
    isMouseLeaveEvent,
    isMouseEnterEvent,
    isWheelEvent,
    isKeyDownEvent,
    isKeyUpEvent
} from '@pixelrpg/engine-core'
import { settings } from '../settings.ts'
import { RpcEndpoint } from "@pixelrpg/message-channel-web";

/**
 * System to handle input for the map editor
 */
export class EditorInputSystem extends System {
    private isDown = false;
    private dragStartPos = { x: 0, y: 0 };

    public systemType = SystemType.Update

    private rpcClient = new RpcEndpoint('pixelrpg')

    private engine?: Engine;

    constructor() {
        super()
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
    }

    public update(delta: number) {
        // Update logic can be added here if needed
    }

    /**
     * Handle pointer move events
     * @param x X coordinate
     * @param y Y coordinate
     */
    protected onPointerMove(x: number, y: number) {
        if (this.isDown && this.engine) {
            // Handle camera movement (drag)
            const zoom = this.engine.currentScene.camera.zoom;
            const deltaX = (x - this.dragStartPos.x) / zoom;
            const deltaY = (y - this.dragStartPos.y) / zoom;
            this.engine.currentScene.camera.x -= deltaX;
            this.engine.currentScene.camera.y -= deltaY;
            this.dragStartPos = { x, y };
        }
    }

    /**
     * Handle pointer down events
     * @param x X coordinate
     * @param y Y coordinate
     */
    protected onPointerDown(x: number, y: number) {
        this.isDown = true;
        this.dragStartPos = { x, y };
    }

    /**
     * Handle pointer up events
     */
    protected onPointerUp() {
        this.isDown = false;
    }

    /**
     * Handle wheel events for zooming
     * @param deltaY Wheel delta Y
     * @param position Mouse position
     */
    protected onWheel(deltaY: number, position: { x: number, y: number }) {
        if (!this.engine) return;

        const direction = deltaY > 0 ? -1 : 1;
        let zoom = this.engine.currentScene.camera.zoom;
        zoom += direction * 0.2;

        // Limit minimum zoom
        if (zoom <= 0.1) {
            zoom = 0.1;
        }

        // Round zoom to one decimal place
        zoom = Math.round(zoom * 10) / 10;

        this.engine.currentScene.camera.zoom = zoom;
        console.debug('[EditorInputSystem] Wheel zoom to', zoom);
    }

    public initialize(world: World, scene: Scene) {
        console.debug('[EditorInputSystem] Initializing');
        if (super.initialize) {
            super.initialize(world, scene);
        }

        this.engine = scene.engine;
        const pointer = this.engine.input.pointers.primary;

        pointer.on('down', (event) => {
            this.onPointerDown(event.screenPos.x, event.screenPos.y);
        });

        pointer.on('up', () => {
            this.onPointerUp();
        });

        pointer.on('cancel', () => {
            this.onPointerUp();
        });

        if (!settings.isWebKitView) {
            console.debug('[EditorInputSystem] Setting up pointer move event listener for default browser behavior');
            // Default browser behavior
            pointer.on('move', (event) => {
                this.onPointerMove(event.screenPos.x, event.screenPos.y);
            });
        } else {
            console.debug('[EditorInputSystem] Setting up RPC client for GJS input events');

            // Register handler for input events from GJS
            this.rpcClient.registerHandler('handleInputEvent', (params) => {
                console.debug('[EditorInputSystem] Input event received via RPC:', params);

                // Verwende die vorhandenen Type Guards anstatt manueller Validierung
                if (isEngineMessage(params) && isInputEventMessage(params)) {
                    // Wir haben eine valide Engine-Message vom Typ INPUT_EVENT
                    const inputEvent = params.payload;
                    console.debug('[EditorInputSystem] Valid input event:', inputEvent);

                    // Verarbeite das Event - Type Guards werden innerhalb handleInputEvent angewendet
                    this.handleInputEvent(inputEvent);
                    return { success: true };
                } else {
                    // Detailliertere Fehlerdiagnose mit vorhandenen Guards
                    if (!isEngineMessage(params)) {
                        console.warn('[EditorInputSystem] Not a valid engine message:', params);
                    } else if (!isInputEventMessage(params)) {
                        console.warn('[EditorInputSystem] Not an input event message:', params);
                    }
                }

                return { success: false, error: 'Invalid input event format' };
            });
        }

        // Handle wheel events for zooming
        pointer.on('wheel', (wheelEvent) => {
            // Extract position from wheelEvent
            const x = wheelEvent.x || 0;
            const y = wheelEvent.y || 0;

            // Handle zooming
            this.onWheel(wheelEvent.deltaY, { x, y });

            // Send wheel event to GJS
            this.rpcClient.sendRequest('handleInputEvent', {
                messageType: EngineMessageType.INPUT_EVENT,
                payload: {
                    type: InputEventType.WHEEL,
                    data: {
                        x,
                        y,
                        deltaY: wheelEvent.deltaY
                    }
                }
            }).catch(error => console.error('Failed to send wheel event:', error));
        });
    }

    /**
     * Clean up resources when this system is removed
     */
    public onRemove(): void {
        // Cleanup the RPC client
        this.rpcClient.destroy();
    }

    /**
     * Handle input events from GJS
     * @param event The input event
     */
    handleInputEvent(event: InputEvent): void {
        // First use type guards to determine the event type for better type safety
        if (isMouseMoveEvent(event)) {
            // Handle mouse move with proper typing
            console.log('Mouse move event from GJS:', event.data);
            // If in webkit view, manually update the pointer position
            if (settings.isWebKitView && this.engine) {
                // Simulate a pointer move in Excalibur
                const pointer = this.engine.input.pointers.primary;

                // Update the pointer position - Excalibur handles pointer positions differently
                // Handle the movement in our system instead of trying to update internal state
                this.onPointerMove(event.data.x, event.data.y);
            }
        } else if (isMouseDownEvent(event)) {
            // Handle mouse down with proper typing
            console.log('Mouse down event from GJS:', event.data);
            if (settings.isWebKitView && this.engine) {
                this.onPointerDown(event.data.x, event.data.y);
            }
        } else if (isMouseUpEvent(event)) {
            // Handle mouse up with proper typing
            console.log('Mouse up event from GJS:', event.data);
            if (settings.isWebKitView && this.engine) {
                this.onPointerUp();
            }
        } else if (isMouseLeaveEvent(event)) {
            // Handle mouse leave with proper typing
            console.log('Mouse leave event from GJS');
            if (settings.isWebKitView && this.engine) {
                // Handle mouse leaving the canvas
                this.onPointerUp(); // treat as pointer up to cancel any dragging
            }
        } else if (isMouseEnterEvent(event)) {
            // Handle mouse enter with proper typing
            console.log('Mouse enter event from GJS:', event.data);
        } else if (isWheelEvent(event)) {
            // Handle wheel with proper typing
            console.log('Wheel event from GJS:', event.data);
            if (settings.isWebKitView && this.engine) {
                this.onWheel(event.data.deltaY, { x: event.data.x, y: event.data.y });
            }
        } else if (isKeyDownEvent(event)) {
            // Handle key down with proper typing
            console.log('Key down event from GJS:', event.data);
        } else if (isKeyUpEvent(event)) {
            // Handle key up with proper typing
            console.log('Key up event from GJS:', event.data);
        } else {
            // Fallback for unknown event types
            console.log('Unhandled input event from GJS:', event);
        }
    }
}