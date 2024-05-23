import type { Vector } from "excalibur";
import type { Tile } from "@excaliburjs/plugin-tiled"
import type { DataVector } from "@pixelrpg/common";

export const vectorToDataVector = (vector: Vector): DataVector => {
    const data: DataVector = {
        x: vector.x,
        y: vector.y,
    }
    return data;
}

