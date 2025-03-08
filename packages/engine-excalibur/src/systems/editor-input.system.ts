import { Engine, System, World, Scene, SystemType } from "excalibur";
import { messagesService } from '../services/messages.service.ts'
import { InputEventType, EngineMessageEventInput, EngineMessageType } from '@pixelrpg/engine-core'
import { settings } from '../settings.ts'

// Define a custom interface for Excalibur wheel events
interface ExcaliburWheelEvent {
    worldPos?: { x: number, y: number };
    screenPos?: { x: number, y: number };
    deltaY: number;
}

/**
 * System to handle input for the map editor
 */
export class EditorInputSystem extends System {
    private isDown = false;
    private dragStartPos = { x: 0, y: 0 };

    public systemType = SystemType.Update

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
            // messagesService.send({
            //     type: 'event',
            //     data: {
            //         name: EngineMessageType.INPUT_EVENT,
            //         data: {
            //             type: InputEventType.MOUSE_MOVE,
            //             data: {
            //                 position: { x, y },
            //                 dragDelta: { x: deltaX, y: deltaY }
            //             }
            //         }
            //     }
            // });
        } else {
            // Send move event to GJS without drag info
            // messagesService.send({
            //     type: 'event',
            //     data: {
            //         name: EngineMessageType.INPUT_EVENT,
            //         data: {
            //             type: InputEventType.MOUSE_MOVE,
            //             data: {
            //                 position: { x, y }
            //             }
            //         }
            //     }
            // });
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
        // messagesService.send({
        //     type: 'event',
        //     data: {
        //         name: EngineMessageType.INPUT_EVENT,
        //         data: {
        //             type: InputEventType.MOUSE_DOWN,
        //             data: {
        //                 position: { x, y },
        //                 button: 0 // Left button
        //             }
        //         }
        //     }
        // });
    }

    /**
     * Handle pointer up events
     */
    protected onPointerUp() {
        this.isDown = false;

        // Send up event to GJS
        // messagesService.send({
        //     type: 'event',
        //     data: {
        //         name: EngineMessageType.INPUT_EVENT,
        //         data: {
        //             type: InputEventType.MOUSE_UP,
        //             data: {
        //                 position: this.dragStartPos,
        //                 button: 0 // Left button
        //             }
        //         }
        //     }
        // });
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

        if (settings.isBrowser) {
            // Default browser behavior
            pointer.on('move', (event) => {
                this.onPointerMove(event.screenPos.x, event.screenPos.y);
            });
        } else {
            // We receive mouse events from GTK via the message service to get drag scrolling also works outside the WebView
            messagesService.on('event', (message) => {
                console.log('[EditorInputSystem] Received message', JSON.stringify(message))
                if (message.data && typeof message.data === 'object' && 'name' in message.data) {
                    const eventData = message.data as any;

                    if (eventData.name === EngineMessageType.INPUT_EVENT && eventData.data) {
                        console.log('Received input event', eventData.data)
                        const inputEvent = eventData.data;

                        switch (inputEvent.type) {
                            case InputEventType.MOUSE_MOVE:
                                if (inputEvent.data && inputEvent.data.position) {
                                    this.onPointerMove(
                                        inputEvent.data.position.x,
                                        inputEvent.data.position.y
                                    );
                                }
                                break;

                            case InputEventType.MOUSE_DOWN:
                                if (inputEvent.data && inputEvent.data.position) {
                                    this.onPointerDown(
                                        inputEvent.data.position.x,
                                        inputEvent.data.position.y
                                    );
                                }
                                break;

                            case InputEventType.MOUSE_UP:
                                this.onPointerUp();
                                break;

                            case InputEventType.MOUSE_LEAVE:
                                this.onPointerUp();
                                break;
                        }
                    }
                }
            });
        }

        // Handle wheel events for zooming
        pointer.on('wheel', (event) => {
            // Cast to our custom interface to access the properties
            const wheelEvent = event as unknown as ExcaliburWheelEvent;

            // Extract position from worldPos or screenPos, or default to 0,0
            const position = wheelEvent.screenPos || wheelEvent.worldPos || { x: 0, y: 0 };

            // Handle zooming
            this.onWheel(wheelEvent.deltaY, position);

            // Send wheel event to GJS
            // messagesService.send({
            //     type: 'event',
            //     data: {
            //         name: EngineMessageType.INPUT_EVENT,
            //         data: {
            //             type: 'wheel',
            //             data: {
            //                 position,
            //                 deltaY: wheelEvent.deltaY
            //             }
            //         }
            //     }
            // });
        });
    }
}