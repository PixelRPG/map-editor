/** @deprecated */
export interface DataMap {
    height: number;
    width: number;
    tileheight: number;
    tilewidth: number;
    tiledversion: string;
    version: string;
    infinite: boolean;
    nextlayerid: number;
    nextobjectid: number;
    orientation: string;
    properties: Record<string, any>;
    class: string;
    // layers: DataLayer[];
}