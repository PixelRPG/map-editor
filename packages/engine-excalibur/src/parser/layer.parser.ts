import type { ResourceParser } from "./resource.parser.ts";
import type { DataLayer, Layer } from "@pixelrpg/common";
import type { TileLayer, IsoTileLayer, ImageLayer, ObjectLayer } from "@excaliburjs/plugin-tiled"

export class LayerParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    protected parseType(layer: TileLayer | IsoTileLayer | ImageLayer | ObjectLayer): DataLayer['type'] {
        if ((layer as ObjectLayer).tiledObjectLayer) {
            return 'object';
        }
        if ((layer as ImageLayer).tiledImageLayer) {
            return 'image';
        }
        if ((layer as IsoTileLayer).tiledTileLayer && (layer as IsoTileLayer).isometricMap) {
            return 'iso-tile';
        }
        if ((layer as TileLayer).tiledTileLayer && (layer as TileLayer).tilemap) {
            return 'tile';
        }
        console.error('Unknown layer type', layer);
        return 'unknown'
    }

    public async parse(layer: Layer): Promise<DataLayer> {
        const data: DataLayer = {
            properties: layer.properties,
            class: layer.class,
            name: layer.name,
            order: layer.order,
            type: this.parseType(layer)
        }
        return data;
    }

    public async parseAll(layers: Layer[]): Promise<DataLayer[]> {
        return Promise.all(layers.map(async (layer) => await this.parse(layer)));
    }
}

