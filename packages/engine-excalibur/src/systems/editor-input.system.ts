import { Engine, System, World, Scene, SystemType } from "excalibur";
import {
    InputEventType,
    EngineMessageType,
    engineMessageParserService,
    engineTypeGuardsService,
    InputEvent
} from '@pixelrpg/engine-core'
import { settings } from '../settings.ts'
import { MessageChannel } from "@pixelrpg/messages-web";

/**
 * System to handle input for the map editor
 */
export class EditorInputSystem extends System {
    private isDown = false;
    private dragStartPos = { x: 0, y: 0 };

    public systemType = SystemType.Update

    private sendInputEventsToGJS = false;

    private messages = new MessageChannel<EngineMessageType>('pixelrpg')

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

            // Send move event to GJS
            if (this.sendInputEventsToGJS) {
                this.messages.postMessage(
                    EngineMessageType.INPUT_EVENT,
                    {
                        type: InputEventType.MOUSE_MOVE,
                        data: {
                            x: x,
                            y: y,
                            deltaX: deltaX,
                            deltaY: deltaY
                        }
                    }
                );
            }
        } else {
            // Send move event to GJS without drag info
            if (this.sendInputEventsToGJS) {
                this.messages.postMessage(
                    EngineMessageType.INPUT_EVENT,
                    {
                        type: InputEventType.MOUSE_MOVE,
                        data: {
                            x: x,
                            y: y
                        }
                    }
                );
            }
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

        // Send down event to GJS
        if (this.sendInputEventsToGJS) {
            this.messages.postMessage(
                EngineMessageType.INPUT_EVENT,
                {
                    type: InputEventType.MOUSE_DOWN,
                    data: {
                        x: x,
                        y: y,
                        button: 0 // Left button
                    }
                }
            );
        }
    }

    /**
     * Handle pointer up events
     */
    protected onPointerUp() {
        this.isDown = false;

        // Send up event to GJS
        if (this.sendInputEventsToGJS) {
            this.messages.postMessage(
                EngineMessageType.INPUT_EVENT,
                {
                    type: InputEventType.MOUSE_UP,
                    data: {
                        x: this.dragStartPos.x,
                        y: this.dragStartPos.y,
                        button: 0 // Left button
                    }
                }
            );
        }
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
        console.debug('Wheel zoom to', zoom);
    }

    public initialize(world: World, scene: Scene) {
        console.debug('Initializing EditorInputSystem');
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
            console.debug('Setting up pointer move event listener for default browser behavior');
            // Default browser behavior
            pointer.on('move', (event) => {
                this.onPointerMove(event.screenPos.x, event.screenPos.y);
            });
        } else {
            console.debug('Setting up message listener for GJS input events');
            // Handle input events from GJS
            this.messages.onmessage = (event) => {

                if (!engineMessageParserService.isEngineMessage(event.data)) {
                    console.debug('Unhandled message type (not an engine message):', event.data);
                    return;
                }

                if (!engineMessageParserService.isInputEventMessage(event.data)) {
                    console.debug('Unhandled message type (not an input event message):', event.data);
                    return;
                }

                console.debug('Input event message received:', event.data);

                const { messageType, payload } = event.data;

                // Handle input events
                if (messageType === EngineMessageType.INPUT_EVENT) {
                    const inputEvent = payload;

                    if (engineTypeGuardsService.isMouseMoveEvent(inputEvent) && inputEvent.data) {
                        // In the new format, data directly contains x and y
                        this.onPointerMove(
                            inputEvent.data.x,
                            inputEvent.data.y
                        );
                    } else if (engineTypeGuardsService.isMouseDownEvent(inputEvent) && inputEvent.data) {
                        this.onPointerDown(
                            inputEvent.data.x,
                            inputEvent.data.y
                        );
                    } else if (engineTypeGuardsService.isMouseUpEvent(inputEvent)) {
                        this.onPointerUp();
                    } else if (engineTypeGuardsService.isMouseLeaveEvent(inputEvent)) {
                        // For mouse leave, we just need to call onPointerUp to cancel any drag operation
                        this.onPointerUp();
                    }
                }
            };
        }

        // Handle wheel events for zooming
        pointer.on('wheel', (wheelEvent) => {
            // Extract position from wheelEvent
            const x = wheelEvent.x || 0;
            const y = wheelEvent.y || 0;

            // Handle zooming
            this.onWheel(wheelEvent.deltaY, { x, y });

            // Send wheel event to GJS
            if (this.sendInputEventsToGJS) {
                this.messages.postMessage(
                    EngineMessageType.INPUT_EVENT,
                    {
                        type: InputEventType.WHEEL,
                        data: {
                            x,
                            y,
                            deltaY: wheelEvent.deltaY
                        }
                    }
                );
            }
        });
    }


    /**
     * Handle input events from GJS
     * @param event The input event
     */
    handleInputEvent(event: InputEvent): void {
        // Handle input events from GJS based on type
        switch (event.type) {
            case InputEventType.MOUSE_MOVE:
                // Handle mouse move
                console.log('Mouse move event from GJS:', event.data)
                break

            case InputEventType.MOUSE_CLICK:
                // Handle mouse click
                console.log('Mouse click event from GJS:', event.data)
                break

            case InputEventType.KEY_DOWN:
                // Handle key down
                console.log('Key down event from GJS:', event.data)
                break

            case InputEventType.KEY_UP:
                // Handle key up
                console.log('Key up event from GJS:', event.data)
                break

            default:
                console.log('Unhandled input event from GJS:', event)
        }
    }
}