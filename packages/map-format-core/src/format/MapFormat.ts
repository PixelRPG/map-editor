import { MapData } from '../types/MapData';

export class MapFormat {
    /**
     * Validates map data structure
     */
    static validate(data: MapData): boolean {
        if (!data.version) {
            throw new Error('Map version is required');
        }
        if (!data.tileWidth || !data.tileHeight) {
            throw new Error('Tile dimensions are required');
        }
        if (!data.columns || !data.rows) {
            throw new Error('Map dimensions (columns/rows) are required');
        }
        if (!Array.isArray(data.layers)) {
            throw new Error('Layers must be an array');
        }

        // Check for either spriteSets
        if (!data.spriteSets) {
            throw new Error('Map must have either spriteSets or tileSets defined');
        }

        return true;
    }

    /**
     * Serializes map data to JSON string
     */
    static serialize(data: MapData): string {
        this.validate(data);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserializes JSON string to map data
     */
    static deserialize(json: string): MapData {
        const data = JSON.parse(json) as MapData;
        this.validate(data);
        return data;
    }
}