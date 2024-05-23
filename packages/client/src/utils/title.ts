import { spriteToDataSprite } from "./sprite.ts";

import type { Sprite } from "excalibur";
import type { Tile } from "@excaliburjs/plugin-tiled"
import type { DataTile } from "@pixelrpg/common";

export const tileToDataTile = async (tile: Tile): Promise<DataTile> => {
    const data: DataTile = {
        animation: tile.animation,
        properties: tile.properties,
        class: tile.class,
        graphic: tile.graphic ? await spriteToDataSprite(tile.graphic as Sprite) : undefined,
    }
    return data;
}

export const tilesToDataTiles = async (tiles: Tile[]): Promise<DataTile[]> => {
    return Promise.all(tiles.map(async (tile) => await tileToDataTile(tile)));
}

