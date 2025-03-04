import type { SpriteSetData } from '../types';

export class SpriteSetFormat {
    /**
     * Validates sprite set data structure
     */
    static validate(data: SpriteSetData): boolean {
        if (!data.id) {
            throw new Error('SpriteSet ID is required');
        }

        // If using images array, validate each image
        if (data.images && data.images.length > 0) {
            for (const img of data.images) {
                if (!img.id) {
                    throw new Error('Each image source must have an ID');
                }
                if (!img.path) {
                    throw new Error('Each image source must have a path');
                }
                if (!img.spriteWidth || !img.spriteHeight) {
                    throw new Error('Each image source must specify sprite dimensions');
                }
                if (!img.columns || !img.rows) {
                    throw new Error('Each image source must specify grid dimensions');
                }
            }
        }

        if (!Array.isArray(data.sprites)) {
            throw new Error('Sprites must be an array');
        }

        // Validate version
        if (!data.version) {
            throw new Error('SpriteSet version is required');
        }

        // Validate animations if present
        if (data.animations) {
            if (!Array.isArray(data.animations)) {
                throw new Error('Animations must be an array');
            }

            for (const anim of data.animations) {
                if (!anim.id) {
                    throw new Error('Each animation must have an ID');
                }
                if (!Array.isArray(anim.frames) || anim.frames.length === 0) {
                    throw new Error('Each animation must have at least one frame');
                }
            }
        }

        return true;
    }

    /**
     * Serializes sprite set data to JSON string
     */
    static serialize(data: SpriteSetData): string {
        this.validate(data);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Deserializes JSON string to sprite set data
     */
    static deserialize(json: string): SpriteSetData {
        const data = JSON.parse(json) as SpriteSetData;
        this.validate(data);
        return data;
    }
} 