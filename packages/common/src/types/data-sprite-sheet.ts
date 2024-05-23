import type { DataSprite } from "./index.ts";
import type { SpriteSheet } from "excalibur"

export interface DataSpriteSheet {
    sprites: DataSprite[];
    rows: SpriteSheet['rows'];
    columns: SpriteSheet['columns'];
}

