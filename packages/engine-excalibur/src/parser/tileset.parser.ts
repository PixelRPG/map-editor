import { TileParser } from "./title.parser.ts";
import { VectorParser } from "./vector.parser.ts";
import { SpriteSheetParser } from "./sprite-sheet.parser.ts";

import type { ResourceParser } from "./resource.parser.ts";
import type { DataTileset } from "@pixelrpg/messages-core";
import type { Tileset } from "@excaliburjs/plugin-tiled";

export class TilesetParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(tileset: Tileset): Promise<DataTileset> {
        const data: DataTileset = {
            name: tileset.name,
            tileWidth: tileset.tileWidth,
            tileHeight: tileset.tileHeight,
            firstGid: tileset.firstGid,
            orientation: tileset.orientation,
            tileOffset: await new VectorParser().parse(tileset.tileOffset),
            objectAlignment: tileset.objectalignment,
            properties: tileset.properties,
            tileCount: tileset.tileCount,
            tiles: await new TileParser({
                resourceParser: this.resourceParser,
            }).parseAll(tileset.tiles),
            spriteSheet: await new SpriteSheetParser({
                resourceParser: this.resourceParser,
            }).parse(tileset.spritesheet),
        }
        console.debug("Parse tileset", tileset)
        return data;
    }
    public async parseAll(tilesets: Tileset[]): Promise<DataTileset[]> {
        return Promise.all(tilesets.map(async (tileset) => await this.parse(tileset)));
    }
}
