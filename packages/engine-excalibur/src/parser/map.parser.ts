import type { ResourceParser } from "./resource.parser.ts";
import type { TiledMap } from "@excaliburjs/plugin-tiled"
import type { DataMap } from "@pixelrpg/common";

export class MapParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(map: TiledMap): Promise<DataMap> {
        const data: DataMap = {
            height: map.height,
            width: map.width,
            tileheight: map.tileheight,
            tilewidth: map.tilewidth,
            tiledversion: map.tiledversion,
            version: map.version,
            infinite: map.infinite,
            nextlayerid: map.nextlayerid,
            nextobjectid: map.nextobjectid,
            orientation: map.orientation,
            properties: map.properties,
            class: map.class,
            // layers: await new LayerParser({
            //     resourceParser: this.resourceParser,
            // }).parseAll(map.layers),
        }
        return data;
    }

    public async parseAll(maps: TiledMap[]): Promise<DataMap[]> {
        return Promise.all(maps.map(async (map) => await this.parse(map)));
    }
}