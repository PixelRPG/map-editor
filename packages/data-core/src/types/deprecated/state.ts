import type { SpriteSetData } from "@pixelrpg/data-core"
import type { DataResource } from "@pixelrpg/data-core"
import type { DataMap } from "@pixelrpg/data-core"
import type { DataLayer } from "@pixelrpg/data-core"

/** @deprecated */
export interface State {
    spriteSheets: SpriteSetData[];
    resources: DataResource[];
    map?: DataMap;
    layers: DataLayer[];
}

