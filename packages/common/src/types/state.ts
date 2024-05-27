import type { DataTileset } from "./data-tileset.ts"
import type { DataResource } from "./data-resource.ts"

export interface State {
    tilesets: DataTileset[];
    resources: DataResource[];
}