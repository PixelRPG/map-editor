import type { ResourceParser } from "./resource.parser.ts";
import type { DataLayer, Layer } from "@pixelrpg/common";

export class LayerParser {

    resourceParser: ResourceParser;

    constructor(params: {
        resourceParser: ResourceParser;
    }) {
        this.resourceParser = params.resourceParser;
    }

    public async parse(layer: Layer): Promise<DataLayer> {
        const data: DataLayer = {
            properties: layer.properties,
            class: layer.class,
            name: layer.name,
            order: layer.order,
        }
        return data;
    }

    public async parseAll(layers: Layer[]): Promise<DataLayer[]> {
        return Promise.all(layers.map(async (layer) => await this.parse(layer)));
    }
}

