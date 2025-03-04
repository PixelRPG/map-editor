import type { Layer, LayerType } from "/home/jumplink/Projekte/pixel-rpg/map-editor/packages/messages-core/src/types/index.ts";



/** @deprecated */
export interface DataLayer {
    /**
     * Name from Tiled
     */
    name: Layer['name'];
    /**
     * Original ordering from Tiled
     */
    order: Layer['order'];
    /**
     * Class name from Tiled
     */
    class: Layer['class'];

    properties: Layer['properties'];

    type: LayerType;
}

