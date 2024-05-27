import type { DataSprite } from "./index.ts";
import type { Tile } from "@excaliburjs/plugin-tiled"

export interface DataTile {
    id: Tile['id'];
    class?: Tile['class'];
    graphic?: DataSprite;
    // TODO: objects: PluginObject[] = []; 
    // TODO: colliders: Collider[] = [];
    animation: Tile['animation'];
    properties: Tile['properties'];
}

