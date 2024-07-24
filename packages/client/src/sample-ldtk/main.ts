
import '../files.d.ts'
import * as ex from "excalibur";
import { Player } from './player';
import { Resources, loader } from "./resources";
import { House } from "./house";
import { Overworld } from "./overworld";

const game = new ex.Engine({
    resolution: {
        width: 256,
        height: 256,
    },
    suppressPlayButton: true,
    displayMode: ex.DisplayMode.FitScreenAndFill,
    pixelArt: true,
    pixelRatio: 4,
    scenes: {
        overworld: {
            scene: Overworld,
            transitions: {
                out: new ex.FadeInOut({ direction: 'out', duration: 1000, color: ex.Color.Black }),
                in: new ex.FadeInOut({ direction: 'in', duration: 1000, color: ex.Color.Black })
            }
        },
        house: {
            scene: House,
            transitions: {
                out: new ex.FadeInOut({ direction: 'out', duration: 1000, color: ex.Color.Black }),
                in: new ex.FadeInOut({ direction: 'in', duration: 1000, color: ex.Color.Black })
            }
        }
    }
});

Resources.LdtkResource.registerEntityIdentifierFactory('PlayerStart', (props) => {
    const player = new Player({
        name: 'player',
        anchor: ex.vec(props.entity.__pivot[0], props.entity.__pivot[1]),
        width: props.entity.width,
        height: props.entity.height,
        pos: props.worldPos,
        z: props.layer.order
    });
    return player;
});

Resources.LdtkResource.registerEntityIdentifierFactory('Door', (props) => {
    const trigger = new ex.Trigger({
        width: props.entity.width,
        height: props.entity.height,
        pos: props.worldPos.add(ex.vec(props.entity.width / 2, props.entity.height / 2)),
        filter: (entity) => {
            return entity instanceof Player
        },
        action: () => {
            game.goToScene(props.entity.fieldInstances[0].__value);
        }
    });
    return trigger;
});

const inTransition = new ex.FadeInOut({
    duration: 1000,
    direction: 'in',
    color: ex.Color.ExcaliburBlue
});
game.start('overworld', {
    loader,
    inTransition
});