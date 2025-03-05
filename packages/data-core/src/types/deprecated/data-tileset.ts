import type { DataTile } from "./index.ts";
import type { Vector } from "../index.ts";
import type { SpriteSetData } from "../index.ts";
import type { Properties } from '../data/index';

/** @deprecated */
export interface DataTileset {
    name: string;
    class?: string;
    firstGid: number;
    tileCount: number;
    tileWidth: number;
    tileHeight: number;
    tileOffset: Vector;
    spriteSheet: SpriteSetData;
    tiles: DataTile[];
    objectAlignment: string;
    orientation: string;
    properties: Properties;
}

