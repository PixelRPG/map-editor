import type { DataVector } from "./index.ts";

// TODO: check which properties are not used / needed
export interface DataGraphic {
    id: number;
    width: number;
    height: number;
    opacity: number;
    rotation: number;
    scale: DataVector;
    flipHorizontal: boolean;
    flipVertical: boolean;
    origin: DataVector | null;
}

