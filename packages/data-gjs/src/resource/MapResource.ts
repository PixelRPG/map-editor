import { MapData, Loadable } from '@pixelrpg/data-core';
import { MapResourceOptions } from '../types/MapResourceOptions';
import { loadTextFile } from '../utils';
import { MapFormat } from '@pixelrpg/data-core';

/**
 * GJS implementation of a map resource loader
 */
export class MapResource implements Loadable<MapData> {
    private _data: MapData | null = null;
    private _path: string;
    private _useGResource: boolean;
    private _resourcePrefix: string | undefined;

    /**
     * Create a new MapResource
     * @param path The path to the map file
     */
    constructor(path: string, options?: MapResourceOptions) {
        this._path = path;
        this._useGResource = options?.useGResource || false;
        this._resourcePrefix = options?.resourcePrefix || undefined;
    }

    /**
     * Load the map data from the file
     * @returns Promise that resolves when the map is loaded
     */
    async load(): Promise<MapData> {
        if (this._data) {
            return this._data;
        }

        try {
            const mapText = await loadTextFile(
                this._path,
                this._useGResource,
                this._resourcePrefix
            );
            this._data = MapFormat.deserialize(mapText);

            return this._data;
        } catch (error) {
            console.error(`Error parsing map file: ${error}`);
            throw error;
        }
    }

    /**
     * Get the loaded map data
     */
    get data(): MapData {
        if (!this._data) {
            throw new Error('Map data not loaded');
        }

        return this._data;
    }

    /**
     * Get the path to the map file
     */
    get path(): string {
        return this._path;
    }

    /**
     * Check if the resource is loaded
     * @returns True if the resource is loaded
     */
    isLoaded(): boolean {
        return this._data !== null;
    }
} 