import type { DataVector } from "./index.ts";
import type { Graphic } from "excalibur"

export interface DataGraphic {
    id: Graphic['id'];
    width: Graphic['width'];
    height: Graphic['height'];
    opacity: Graphic['opacity'];
    rotation: Graphic['rotation'];
    scale: DataVector;
    flipHorizontal: Graphic['flipHorizontal'];
    flipVertical: Graphic['flipVertical'];
    origin: DataVector | null;
}

