import { ImageSource } from "excalibur";
import { normalizeUrl } from "../utils/url.ts";
import type { DataResource } from "@pixelrpg/common";

export class ResourceParser {

    basePath: string;

    constructor(params: {
        basePath: string;
    }) {
        this.basePath = params.basePath;
    }

    _resources: {
        [key: string]: DataResource
    } = {}

    get resources() {
        return Object.values(this._resources)
    }

    getByPath(path: string) {
        return this._resources[path]
    }

    public async parse(resource: ImageSource): Promise<DataResource> {
        if (resource instanceof ImageSource) {
            const path = normalizeUrl(resource.path, this.basePath)
            if (this._resources[path]) {
                return this._resources[path]
            }
            const data: DataResource = {
                path,
                // All canvas images are png
                mimeType: path.endsWith(".png") ? "image/png" : "unknown",
            }
            this._resources[path] = data
            return data
        }
        throw new Error("Invalid resource type")
    }
}