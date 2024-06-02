import type { DataTile, DataVector, DataSpriteSheet } from "./index.ts";
import type { Tileset } from "@excaliburjs/plugin-tiled"

export interface DataTileset {
    name: Tileset['name'];
    class?: Tileset['class'];
    firstGid: Tileset['firstGid'];
    tileCount: Tileset['tileCount'];
    tileWidth: Tileset['tileWidth'];
    tileHeight: Tileset['tileHeight'];
    tileOffset: DataVector;
    spriteSheet: DataSpriteSheet;
    tiles: DataTile[];
    objectAlignment: Tileset['objectalignment'];
    orientation: Tileset['orientation'];
    properties: Tileset['properties'];
}

