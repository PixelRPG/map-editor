import { Properties } from "../data/Properties";

/** @deprecated */
export interface DataLayer {
    /**
     * Name from Tiled
     */
    name: string;
    /**
     * Original ordering from Tiled
     */
    order: number;
    /**
     * Class name from Tiled
     */
    class: string;

    properties: Properties;

    type: string;
}

