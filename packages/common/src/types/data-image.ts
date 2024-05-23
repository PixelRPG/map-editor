import type { DataResource } from "./index.ts";
import type { ImageSource } from "excalibur";

export interface DataImage {
    resource: DataResource;
    path: ImageSource['path'];
    width: ImageSource['width'];
    height: ImageSource['height'];
}

