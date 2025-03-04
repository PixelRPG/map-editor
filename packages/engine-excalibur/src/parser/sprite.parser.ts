import { GraphicParser } from "./graphic.parser.ts";

import type { ResourceParser } from "./resource.parser.ts";
import type { DataSprite } from "@pixelrpg/messages-core";
import type { Sprite } from "excalibur";

export class SpriteParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(sprite: Sprite): Promise<DataSprite> {
        const graphicData = await new GraphicParser().parse(sprite);
        const spriteData: DataSprite = {
            ...graphicData,
            image: {
                width: sprite.image.width,
                height: sprite.image.height,
                resourcePath: (await this.resourceParser.parse(sprite.image)).path,
            }
        }
        return spriteData;
    }

    public async parseAll(sprites: Sprite[]): Promise<DataSprite[]> {
        return Promise.all(sprites.map(async (sprite) => await this.parse(sprite)));
    }
}