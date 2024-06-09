import { SpriteParser } from "./sprite.parser.ts";

import type { ResourceParser } from "./resource.parser.ts";
import type { Sprite } from "excalibur";
import type { Tile } from "@excaliburjs/plugin-tiled"
import type { DataTile } from "@pixelrpg/common";

export class TileParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(tile: Tile): Promise<DataTile> {
        const data: DataTile = {
            id: tile.id,
            animation: tile.animation,
            properties: tile.properties,
            class: tile.class,
            graphic: tile.graphic ? await new SpriteParser({
                resourceParser: this.resourceParser,
            }).parse(tile.graphic as Sprite) : undefined,
        }
        return data;
    }

    public async parseAll(tiles: Tile[]): Promise<DataTile[]> {
        return Promise.all(tiles.map(async (tile) => await this.parse(tile)));
    }
}