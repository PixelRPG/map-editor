import { Engine, System, World, Scene, SystemType } from "excalibur";
import { messagesService } from '../services/messages.service.ts'
import {
    InputEventType,
    EngineMessageType,
    engineMessagesService,
    engineInputEventsService,
    engineMessageParserService,
    engineTypeGuardsService
} from '@pixelrpg/engine-core'
import { settings } from '../settings.ts'

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
            messagesService.send(engineMessagesService.inputEvent(
                engineInputEventsService.mouseMove({ x, y }, { x: deltaX, y: deltaY })
            ));
        } else {
            // Send move event to GJS without drag info
            messagesService.send(engineMessagesService.inputEvent(
                engineInputEventsService.mouseMove({ x, y })
            ));
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
        messagesService.send(engineMessagesService.inputEvent(
            engineInputEventsService.mouseDown({ x, y }, 0) // Left button
        ));
    }

    /**
     * Handle pointer up events
     */
    protected onPointerUp() {
        this.isDown = false;

        // Send up event to GJS
        messagesService.send(engineMessagesService.inputEvent(
            engineInputEventsService.mouseUp(this.dragStartPos, 0) // Left button
        ));
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

        if (!settings.isWebKitView) {
            // Default browser behavior
            pointer.on('move', (event) => {
                this.onPointerMove(event.screenPos.x, event.screenPos.y);
            });
        } else {
            // We receive mouse events from GTK via the message service to get drag scrolling also works outside the WebView
            messagesService.on('event', (message) => {
                console.log('[EditorInputSystem] Received message', JSON.stringify(message))

                if (engineMessageParserService.isInputEventMessage(message)) {
                    const inputEvent = engineMessageParserService.getEventData(message);
                    console.log('Received input event', inputEvent);

                    if (engineTypeGuardsService.isMouseMoveEvent(inputEvent) && inputEvent.data) {
                        this.onPointerMove(
                            inputEvent.data.position.x,
                            inputEvent.data.position.y
                        );
                    } else if (engineTypeGuardsService.isMouseDownEvent(inputEvent) && inputEvent.data) {
                        this.onPointerDown(
                            inputEvent.data.position.x,
                            inputEvent.data.position.y
                        );
                    } else if (engineTypeGuardsService.isMouseUpEvent(inputEvent)) {
                        this.onPointerUp();
                    } else if (engineTypeGuardsService.isMouseLeaveEvent(inputEvent)) {
                        // For mouse leave, we just need to call onPointerUp to cancel any drag operation
                        this.onPointerUp();
                    }
                }
            });
        }

        // Handle wheel events for zooming
        pointer.on('wheel', (wheelEvent) => {
            // Extract position from worldPos or screenPos, or default to 0,0
            const position = { x: wheelEvent.x || 0, y: wheelEvent.y || 0 }

            // Handle zooming
            this.onWheel(wheelEvent.deltaY, position);

            // Send wheel event to GJS
            messagesService.send(engineMessagesService.inputEvent(
                engineInputEventsService.wheel(position, wheelEvent.deltaY)
            ));
        });
    }
}