import { TileSetData } from '../types';
import { Sprite, ImageSource, SpriteSheet } from 'excalibur';

export class TileSetFormat {
    /**
     * Validates tileset data structure
     */
    static validate(data: TileSetData): boolean {
        if (!data.id) {
            throw new Error('Tileset ID is required');
        }
        if (!data.image) {
            throw new Error('Tileset image path is required');
        }
        if (!data.tileWidth || !data.tileHeight) {
            throw new Error('Tile dimensions are required');
        }
        if (!data.columns || !data.rows) {
            throw new Error('Tileset dimensions are required');
        }
        if (!Array.isArray(data.tiles)) {
            throw new Error('Tiles must be an array');
        }
        return true;
    }

    /**
     * Serializes tileset data to JSON string
     */
    static serialize(data: TileSetData): string {
        this.validate(data);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserializes JSON string to tileset data
     */
    static deserialize(json: string): TileSetData {
        const data = JSON.parse(json) as TileSetData;
        this.validate(data);
        return data;
    }

    /**
     * Converts tileset data to Excalibur SpriteSheet
     */
    static toExcalibur(data: TileSetData): {
        spriteSheet: SpriteSheet,
        sprites: Record<number, Sprite>
    } {
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
        data.tiles.forEach(tile => {
            const sprite = spriteSheet.getSprite(tile.col, tile.row);
            if (sprite) {
                sprites[tile.id] = sprite;
            }
        });

        return { spriteSheet, sprites };
    }
} 