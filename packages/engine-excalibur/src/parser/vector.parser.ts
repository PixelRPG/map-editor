import type { Vector } from "excalibur";
import type { DataVector } from "@pixelrpg/messages-core";

export class VectorParser {
    public async parse(vector: Vector): Promise<DataVector> {
        const data: DataVector = {
            x: vector.x,
            y: vector.y,
        }
        return data;
    }

    public async parseAll(vectors: Vector[]): Promise<DataVector[]> {
        return Promise.all(vectors.map(async (vector) => await this.parse(vector)));
    }
}