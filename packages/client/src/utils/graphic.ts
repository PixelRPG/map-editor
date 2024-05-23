import { vectorToDataVector } from "./vector.ts";
import type { DataGraphic } from "@pixelrpg/common";
import type { Graphic } from "excalibur";

export const graphicToDataGraphic = (graphic: Graphic): DataGraphic => {
    const data: DataGraphic = {
        flipHorizontal: graphic.flipHorizontal,
        flipVertical: graphic.flipVertical,
        opacity: graphic.opacity,
        rotation: graphic.rotation,
        scale: vectorToDataVector(graphic.scale),
        width: graphic.width,
        height: graphic.height,
        id: graphic.id,
        origin: graphic.origin ? vectorToDataVector(graphic.origin) : null,
    }
    return data;
}

