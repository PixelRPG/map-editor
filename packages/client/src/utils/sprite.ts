import { graphicToDataGraphic } from "./graphic";

import type { DataSprite } from "@pixelrpg/common";
import type { Sprite } from "excalibur";

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;
            resolve(base64data as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export const spriteToDataSprite = async (sprite: Sprite): Promise<DataSprite> => {
    const graphicData = graphicToDataGraphic(sprite);
    const spriteData: DataSprite = {
        ...graphicData,
        image: {
            width: sprite.image.width,
            height: sprite.image.height,
            path: sprite.image.path,
            resource: {
                type: "blob",
                data: await blobToBase64(sprite.image.resource.data),
            }
        }
    }
    return spriteData;
}

