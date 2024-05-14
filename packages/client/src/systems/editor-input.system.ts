import { Engine, System, World, Scene, SystemType } from "excalibur";

export class EditorInputSystem extends System {
    private isDown = false;
    private dragStartPos = { x: 0, y: 0 };

    public systemType = SystemType.Update

    engine?: Engine;

    constructor() {
        super()
    }

    public update(delta: number) {
        // this.engine!.input.pointers.primary.lastWorldPos

    }

    public initialize(world: World, scene: Scene) {
        this.engine = scene.engine;
        const pointer = this.engine.input.pointers.primary;

        pointer.on('down', (evt) => {
            this.isDown = true;
            this.dragStartPos = { x: evt.screenPos.x, y: evt.screenPos.y };
        });

        pointer.on('up', (evt) => {
            if (this.isDown) {
                this.isDown = false;
            }
        });

        pointer.on('move', (evt) => {
            if (this.isDown) {
                const zoom = this.engine!.currentScene.camera.zoom;
                const deltaX = (evt.screenPos.x - this.dragStartPos.x) / zoom;
                const deltaY = (evt.screenPos.y - this.dragStartPos.y) / zoom;
                this.engine!.currentScene.camera.x -= deltaX;
                this.engine!.currentScene.camera.y -= deltaY;
                this.dragStartPos = { x: evt.screenPos.x, y: evt.screenPos.y };
                console.debug('move', evt.screenPos.x, evt.screenPos.y)
            }
        });


        pointer.on('cancel', (evt) => {
            this.isDown = false;
        });

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