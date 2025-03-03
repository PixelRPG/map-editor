import { GameProjectData, MapCategory, GameSpriteSetReference } from '../types';
import { MapReference } from '../types/MapReference';

export class GameProjectFormat {
    /**
     * Validates game project data structure
     */
    static validate(data: GameProjectData): boolean {
        if (!data.version) {
            throw new Error('Game project version is required');
        }
        if (!data.id) {
            throw new Error('Game project id is required');
        }
        if (!data.name) {
            throw new Error('Game project name is required');
        }
        if (!data.startup || !data.startup.initialMapId) {
            throw new Error('Game project startup configuration is required');
        }
        if (!Array.isArray(data.maps) || data.maps.length === 0) {
            throw new Error('Game project must have at least one map');
        }
        if (!Array.isArray(data.spriteSets)) {
            throw new Error('Game project spriteSets must be an array');
        }

        // Ensure all map references have the required properties
        data.maps.forEach(map => {
            if (!map.id || !map.path || map.type !== 'data') {
                throw new Error('Invalid map reference');
            }
        });

        // Ensure all sprite set references have the required properties
        data.spriteSets.forEach(spriteSet => {
            if (!spriteSet.id || !spriteSet.path || spriteSet.type !== 'spriteset') {
                throw new Error('Invalid sprite set reference');
            }
        });

        // Ensure map categories have required properties
        if (data.mapCategories) {
            data.mapCategories.forEach(category => {
                if (!category.id || !category.name) {
                    throw new Error('Map categories must have id and name');
                }
            });
        }

        // Validate that initialMapId exists in maps
        const initialMapExists = data.maps.some(map => map.id === data.startup.initialMapId);
        if (!initialMapExists) {
            throw new Error(`Initial map with id '${data.startup.initialMapId}' not found in maps`);
        }

        return true;
    }

    /**
     * Serializes game project data to JSON string
     */
    static serialize(data: GameProjectData): string {
        this.validate(data);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserializes JSON string to game project data
     */
    static deserialize(json: string): GameProjectData {
        const data = JSON.parse(json) as GameProjectData;
        this.validate(data);
        return data;
    }
} 