import { VectorParser } from "./vector.parser.ts";
import type { DataGraphic } from "@pixelrpg/messages-core";
import type { Graphic } from "excalibur";

export class GraphicParser {
    public async parse(graphic: Graphic): Promise<DataGraphic> {
        const data: DataGraphic = {
            flipHorizontal: graphic.flipHorizontal,
            flipVertical: graphic.flipVertical,
            opacity: graphic.opacity,
            rotation: graphic.rotation,
            scale: await new VectorParser().parse(graphic.scale),
            width: graphic.width,
            height: graphic.height,
            id: graphic.id,
            origin: graphic.origin ? await new VectorParser().parse(graphic.origin) : null,
        }
        return data;
    }
}