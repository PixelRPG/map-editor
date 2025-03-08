import { Engine, System, World, Scene, SystemType } from "excalibur";
import { messagesService } from '../services/messages.service.ts'
import { InputEventType, EngineMessageEventInput } from '@pixelrpg/engine-core'

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

    protected onPointerMove(x: number, y: number) {
        if (this.isDown) {
            // Handle dragging
            const dx = x - this.dragStartPos.x;
            const dy = y - this.dragStartPos.y;

            // Send drag event to GJS
            messagesService.send({
                type: 'event',
                data: {
                    name: 'input-event',
                    data: {
                        type: InputEventType.MOUSE_MOVE,
                        data: {
                            position: { x, y },
                            dragDelta: { x: dx, y: dy }
                        }
                    }
                }
            });
        } else {
            // Send move event to GJS
            messagesService.send({
                type: 'event',
                data: {
                    name: 'input-event',
                    data: {
                        type: InputEventType.MOUSE_MOVE,
                        data: {
                            position: { x, y }
                        }
                    }
                }
            });
        }
    }

    protected onPointerDown(x: number, y: number) {
        this.isDown = true;
        this.dragStartPos = { x, y };

        // Send down event to GJS
        messagesService.send({
            type: 'event',
            data: {
                name: 'input-event',
                data: {
                    type: InputEventType.MOUSE_DOWN,
                    data: {
                        position: { x, y },
                        button: 0 // Left button
                    }
                }
            }
        });
    }

    protected onPointerUp() {
        this.isDown = false;

        // Send up event to GJS
        messagesService.send({
            type: 'event',
            data: {
                name: 'input-event',
                data: {
                    type: InputEventType.MOUSE_UP,
                    data: {
                        position: this.dragStartPos,
                        button: 0 // Left button
                    }
                }
            }
        });
    }

    public initialize(world: World, scene: Scene) {
        super.initialize(world, scene);

        this.engine = scene.engine;

        // Add event listeners
        this.engine.input.pointers.primary.on('move', (event) => {
            this.onPointerMove(event.worldPos.x, event.worldPos.y);
        });

        this.engine.input.pointers.primary.on('down', (event) => {
            this.onPointerDown(event.worldPos.x, event.worldPos.y);
        });

        this.engine.input.pointers.primary.on('up', () => {
            this.onPointerUp();
        });

        this.engine.input.pointers.primary.on('cancel', () => {
            this.onPointerUp();
        });

        // Handle wheel events - Excalibur's wheel event has a custom structure
        this.engine.input.pointers.primary.on('wheel', (event) => {
            // Cast to our custom interface to access the properties
            const wheelEvent = event as unknown as ExcaliburWheelEvent;

            // Extract position from worldPos or screenPos, or default to 0,0
            const position = wheelEvent.worldPos ?
                { x: wheelEvent.worldPos.x, y: wheelEvent.worldPos.y } :
                wheelEvent.screenPos ?
                    { x: wheelEvent.screenPos.x, y: wheelEvent.screenPos.y } :
                    { x: 0, y: 0 };

            // Send wheel event to GJS
            messagesService.send({
                type: 'event',
                data: {
                    name: 'input-event',
                    data: {
                        type: 'wheel',
                        data: {
                            position,
                            deltaY: wheelEvent.deltaY
                        }
                    }
                }
            });
        });
    }
}