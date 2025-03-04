import type { DataTile, DataVector, DataSpriteSheet } from "./index.ts";

/** @deprecated */
export interface DataTileset {
    name: string;
    class?: string;
    firstGid: number;
    tileCount: number;
    tileWidth: number;
    tileHeight: number;
    tileOffset: DataVector;
    spriteSheet: DataSpriteSheet;
    tiles: DataTile[];
    objectAlignment: string;
    orientation: string;
    properties: Record<string, any>;
}

