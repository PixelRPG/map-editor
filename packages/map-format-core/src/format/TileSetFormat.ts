import { TileSetData } from '../types/index.ts';

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
} 