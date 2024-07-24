import { ImageFiltering, ImageSource, Loader } from "excalibur";
import { LdtkResource } from '@excaliburjs/plugin-ldtk';
import heroImgPath from '../assets/Solaria Demo Pack Update 03/Solaria Demo Pack Update 03/16x16/Sprites/Hero 01.png?url';
import tilesetPath from '../assets/Solaria Demo Pack Update 03/Solaria Demo Pack Update 03/16x16/Tilesets/Solaria Demo Update 01.png?url';
import ldtkLevel0 from '../assets/top-down/Level_0.ldtkl?url';
import ldtkLevel1 from '../assets/top-down/Level_1.ldtkl?url';
import ldtkHouse from '../assets/top-down/House.ldtkl?url';
import ldtkPath from '../assets/top-down.ldtk?url';

export const Resources = {
    HeroSpriteSheetPng: new ImageSource(heroImgPath),
    LdtkResource: new LdtkResource(ldtkPath, {
        useTilemapCameraStrategy: true,
        useMapBackgroundColor: true,
        // Path map intercepts and redirects to work around vite's static bundling
        pathMap: [
            { path: 'Hero 01.png', output: heroImgPath },
            { path: 'Level_0.ldtkl', output: ldtkLevel0 },
            { path: 'Level_1.ldtkl', output: ldtkLevel1 },
            { path: 'House.ldtkl', output: ldtkHouse },
            { path: 'Solaria Demo Update 01.png', output: tilesetPath },
        ]
    })
} as const;


export const loader = new Loader();
for (let resource of Object.values(Resources)) {
    loader.addResource(resource);
}