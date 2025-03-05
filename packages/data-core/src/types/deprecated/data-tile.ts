import type { DataSprite } from "./data-sprite.ts";
import type { Properties } from '../data/index';

/** @deprecated */
export interface DataTile {
    id: number;
    class?: string;
    graphic?: DataSprite;
    // TODO: objects: PluginObject[] = []; 
    // TODO: colliders: Collider[] = [];
    animation: { tileid: number, duration: number }[];
    properties: Properties;
}

