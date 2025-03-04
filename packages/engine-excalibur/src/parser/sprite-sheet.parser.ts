import { SpriteParser } from "./sprite.parser.ts";

import type { ResourceParser } from "./resource.parser.ts";
import type { DataSpriteSheet } from "@pixelrpg/messages-core";
import type { SpriteSheet } from "excalibur";

export class SpriteSheetParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(spriteSheet: SpriteSheet): Promise<DataSpriteSheet> {
        const spriteData: DataSpriteSheet = {
            rows: spriteSheet.rows,
            columns: spriteSheet.columns,
            sprites: await new SpriteParser({
                resourceParser: this.resourceParser,
            }).parseAll(spriteSheet.sprites),
        }
        return spriteData;
    }
}