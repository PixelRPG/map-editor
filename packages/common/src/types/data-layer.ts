import type { Layer } from "./index.ts";



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
    class?: Layer['class'];

    properties: Layer['properties'];
}

