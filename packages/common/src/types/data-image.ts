import type { ImageSource } from "excalibur";

export interface DataImage {
    /**
     * The path to the resource
     */
    resourcePath: string;
    /**
     * The path to the image
     */
    width: ImageSource['width'];
    height: ImageSource['height'];
}

