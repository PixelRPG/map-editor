import { Sprite, ImageSource, SpriteSheet, Animation, AnimationStrategy } from 'excalibur';
import { TileSetFormat, TileSetData, TileDataTileSet } from '@pixelrpg/map-format-core';

export class ExcaliburTileSetFormat extends TileSetFormat {
    /**
     * Converts tileset data to Excalibur SpriteSheet
     */
    static toExcalibur(data: TileSetData): {
        spriteSheet: SpriteSheet,
        sprites: Record<number, Sprite>,
        animations: Record<number, Animation>
    } {
        TileSetFormat.validate(data);

        // 1. Create ImageSource
        const imageSource = new ImageSource(data.image);

        // 2. Create SpriteSheet
        const spriteSheet = SpriteSheet.fromImageSource({
            image: imageSource,
            grid: {
                rows: data.rows,
                columns: data.columns,
                spriteHeight: data.tileHeight,
                spriteWidth: data.tileWidth
            },
            spacing: data.spacing ? {
                margin: {
                    x: data.spacing,
                    y: data.spacing
                }
            } : undefined
        });

        // 3. Create sprite lookup for each defined tile
        const sprites: Record<number, Sprite> = {};
        data.tiles.forEach((tile: TileDataTileSet) => {
            const sprite = spriteSheet.getSprite(tile.col, tile.row);
            if (sprite) {
                sprites[tile.id] = sprite;
            }
        });

        const animations: Record<number, Animation> = {};

        data.tiles.forEach((tile: TileDataTileSet) => {
            if (tile.animation) {
                const frames = tile.animation.frames.map((frame: { tileId: number, duration: number }) => ({
                    graphic: sprites[frame.tileId],
                    duration: frame.duration
                }));

                animations[tile.id] = new Animation({
                    frames,
                    strategy: (tile.animation.strategy || 'loop') as AnimationStrategy
                });
            }
        });

        return { spriteSheet, sprites, animations };
    }
} 