import { Engine, System, World, Scene, SystemType } from "excalibur";
import { settings } from '../settings.ts'
import { messagesService } from '../services/messages.service.ts'

/**
 * We use this system to handle the input for the map editor.
 */
export class EditorInputSystem extends System {
    private isDown = false;
    private dragStartPos = { x: 0, y: 0 };

    public systemType = SystemType.Update

    engine?: Engine;

    constructor() {
        super()
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
    }

    public update(delta: number) {
        // this.engine!.input.pointers.primary.lastWorldPos

    }

    protected onPointerMove(x: number, y: number) {
        if (this.isDown) {
            const zoom = this.engine!.currentScene.camera.zoom;
            const deltaX = (x - this.dragStartPos.x) / zoom;
            const deltaY = (y - this.dragStartPos.y) / zoom;
            this.engine!.currentScene.camera.x -= deltaX;
            this.engine!.currentScene.camera.y -= deltaY;
            this.dragStartPos = { x: x, y: y };
            // console.debug('move', x, y)
        }
    }

    protected onPointerDown(x: number, y: number) {
        this.isDown = true;
        this.dragStartPos = { x, y };
    }

    protected onPointerUp() {
        this.isDown = false;
    }

    public initialize(world: World, scene: Scene) {
        this.engine = scene.engine;
        const pointer = this.engine.input.pointers.primary;

        pointer.on('down', (evt) => {
            this.onPointerDown(evt.screenPos.x, evt.screenPos.y);
        });

        pointer.on('up', this.onPointerUp);

        if (settings.isBrowser) {
            // Default browser behavior
            pointer.on('move', (evt) => {
                const x = evt.screenPos.x;
                const y = evt.screenPos.y;
                this.onPointerMove(x, y);
            });
        } else {
            // We send the mouse events from GTK to the WebView so that drag scrolling also works outside the WebView
            messagesService.onEvent('mouse-move', (message) => {
                const x = message.data.data.x;
                const y = message.data.data.y;
                this.onPointerMove(x, y);
            })

            messagesService.onEvent('mouse-leave', this.onPointerUp)
        }


        pointer.on('cancel', this.onPointerUp);

        pointer.on('wheel', (evt) => {
            const direction = evt.deltaY > 0 ? -1 : 1
            let zoom = this.engine!.currentScene.camera.zoom;
            zoom += direction * 0.2;
            if (zoom <= 0.1) {
                zoom = 0.1;
            }

            // Round zoom to one decimal place
            zoom = Math.round(zoom * 10) / 10;

            this.engine!.currentScene.camera.zoom = zoom;
            console.debug('wheel zoom to', this.engine!.currentScene.camera.zoom)
        });
    }
}