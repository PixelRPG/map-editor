import type { DataTileset } from "./data-tileset.ts"
import type { DataResource } from "./data-resource.ts"
import type { DataMap } from "./data-map.ts"
import type { DataLayer } from "./data-layer.ts"

export interface State {
    tilesets: DataTileset[];
    resources: DataResource[];
    map: DataMap;
    layers: DataLayer[];
}

