import { spritesToDataSprites } from "./sprite.ts";
import { getImageBase64, getImageMimeType } from "./format.ts";

import type { DataSpriteSheet } from "@pixelrpg/common";
import type { SpriteSheet } from "excalibur";

export const spriteSheetToDataSpriteSheet = async (spriteSheet: SpriteSheet): Promise<DataSpriteSheet> => {

    const spriteData: DataSpriteSheet = {
        rows: spriteSheet.rows,
        columns: spriteSheet.columns,
        sprites: await spritesToDataSprites(spriteSheet.sprites),
    }
    return spriteData;
}
