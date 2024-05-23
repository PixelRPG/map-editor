import type { DataGraphic, DataImage } from "./index.ts";
import type { Sprite } from "excalibur"

export interface DataSprite extends DataGraphic {
    width: Sprite['width'];
    height: Sprite['height'];
    image: DataImage;
    // TODO: ...

}

