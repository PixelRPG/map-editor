import type { Properties } from '../data/index';

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
    properties: Properties;
    class: string;
    // layers: DataLayer[];
}