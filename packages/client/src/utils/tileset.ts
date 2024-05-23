import { tilesToDataTiles } from "./title.ts";
import { vectorToDataVector } from "./vector.ts";
import { spriteSheetToDataSpriteSheet } from "./sprite-sheet.ts";

import type { DataTileset } from "@pixelrpg/common";
import type { Tileset } from "@excaliburjs/plugin-tiled";

export const tilesetToDataTileset = async (tileset: Tileset): Promise<DataTileset> => {
    const data: DataTileset = {
        name: tileset.name,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        firstGid: tileset.firstGid,
        orientation: tileset.orientation,
        tileOffset: vectorToDataVector(tileset.tileOffset),
        objectalignment: tileset.objectalignment,
        properties: tileset.properties,
        tileCount: tileset.tileCount,
        tiles: await tilesToDataTiles(tileset.tiles),
        spritesheet: await spriteSheetToDataSpriteSheet(tileset.spritesheet),
    }
    return data;
}

export const tilesetsToDataTilesets = async (tilesets: Tileset[]): Promise<DataTileset[]> => {
    return Promise.all(tilesets.map(async (tileset) => await tilesetToDataTileset(tileset)));
}

