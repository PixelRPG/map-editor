import { graphicToDataGraphic } from "./graphic.ts";
import { getImageBase64, getImageMimeType } from "./format.ts";

import type { DataSprite } from "@pixelrpg/common";
import type { Sprite } from "excalibur";

const extractSprite = (image: HTMLImageElement, posX: number, posY: number, spriteWidth: number, spriteHeight: number, canvas?: HTMLCanvasElement, ctx?: CanvasRenderingContext2D) => {

    canvas ||= document.createElement('canvas')!;
    ctx ||= canvas.getContext('2d')!;

    canvas.width = spriteWidth;
    canvas.height = spriteHeight;

    // Clear the canvas for the new sprite
    ctx.clearRect(0, 0, spriteWidth, spriteHeight);

    // Draw the sprite slice on the canvas
    ctx.drawImage(image, posX, posY, spriteWidth, spriteHeight, 0, 0, spriteWidth, spriteHeight);

    // Extract the sprite as a Data URL / Base64 string
    const dataUrl = canvas.toDataURL();

    return dataUrl;
}


const splitSpriteSheet = (image: HTMLImageElement, spriteWidth: number, spriteHeight: number, rows: number, columns: number) => {

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not found');
    canvas.width = spriteWidth;
    canvas.height = spriteHeight;
    const res: string[] = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            // Calculate the sprite slice for each sprite
            const posX = x * spriteWidth;
            const posY = y * spriteHeight;
            res.push(extractSprite(image, posX, posY, spriteWidth, spriteHeight, canvas, ctx));
        }
    }
    return res;
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
                format: "base64",
                mimeType: await getImageMimeType(sprite.image.data),
                data: extractSprite(sprite.image.data, sprite.image.width, sprite.image.height, sprite.sourceView.x, sprite.sourceView.y),
            }
        }
    }
    return spriteData;
}

// TODO: Use `splitSpriteSheet` here
export const spritesToDataSprites = async (sprites: Sprite[]): Promise<DataSprite[]> => {
    return Promise.all(sprites.map(sprite => spriteToDataSprite(sprite)));
}
