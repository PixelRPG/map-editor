import { Actor, Engine, Scene, SceneActivationContext, TransformComponent, vec } from "excalibur";
import { Resources } from "./resources";
import { Player } from "./player";


export class Overworld extends Scene {
    
    onInitialize(engine: Engine<any>): void {
        Resources.LdtkResource.addToScene(this, {
            pos: vec(0, 0),
            levelFilter: ['Level_0', 'Level_1']
        });
    }

    onActivate(context: SceneActivationContext<unknown>): void {
        const player = this.world.entityManager.getByName('player')[0];
        if (player instanceof Player) {
            this.camera.strategy.lockToActor(player as Actor);
        }
        const bounds = Resources.LdtkResource.getLevelBounds(['Level_0', 'Level_1']);
        this.camera.strategy.limitCameraBounds(bounds);
    }
}