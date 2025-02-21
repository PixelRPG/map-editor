// import type { DataTile, DataVector, DataSpriteSheet } from "./index.ts";
import type { TiledMap } from "@excaliburjs/plugin-tiled"

export interface DataMap {
    height: TiledMap['height'];
    width: TiledMap['width'];
    tileheight: TiledMap['tileheight'];
    tilewidth: TiledMap['tilewidth'];
    tiledversion: TiledMap['tiledversion'];
    version: TiledMap['version'];
    infinite: TiledMap['infinite'];
    nextlayerid: TiledMap['nextlayerid'];
    nextobjectid: TiledMap['nextobjectid'];
    orientation: TiledMap['orientation'];
    properties: TiledMap['properties'];
    class: TiledMap['class'];
    // layers: DataLayer[];
}

