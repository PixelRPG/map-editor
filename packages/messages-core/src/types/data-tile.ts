import type { DataSprite } from "./index.ts";

/** @deprecated */
export interface DataTile {
    id: number;
    class?: string;
    graphic?: DataSprite;
    // TODO: objects: PluginObject[] = []; 
    // TODO: colliders: Collider[] = [];
    animation: { tileid: number, duration: number }[];
    properties: Record<string, any>;
}

