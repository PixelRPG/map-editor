import { Actor, DefaultLoader, Engine, Scene, SceneActivationContext, TransformComponent, vec } from "excalibur";
import { Resources } from "./resources";
import { Player } from "./player";

export class House extends Scene {

    playerSpawnLocation = vec(0, 0);
    onPreLoad(loader: DefaultLoader): void {
    }

    onInitialize(engine: Engine<any>): void {
        Resources.LdtkResource.addToScene(this, {
            levelFilter: ['House']
        });
        const entities = Resources.LdtkResource.getEntityLayers('House')[0];
        const playerStart = entities.getLdtkEntitiesByIdentifier('PlayerStart')[0];
        this.playerSpawnLocation = vec(playerStart.__worldX ?? 0, playerStart.__worldY ?? 0);
    }

    onActivate(context: SceneActivationContext<unknown>): void {
        const player = this.world.entityManager.getByName('player')[0];
        player.get(TransformComponent).pos = this.playerSpawnLocation;
        if (player instanceof Player) {
            this.camera.strategy.lockToActor(player as Actor);
        }
        const bounds = Resources.LdtkResource.getLevelBounds(['House']);
        this.camera.strategy.limitCameraBounds(bounds);
    }
}