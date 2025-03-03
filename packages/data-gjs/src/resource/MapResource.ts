import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';
import { MapData } from '@pixelrpg/data-core';
import { MapResourceOptions } from '../types/MapResourceOptions';

/**
 * GJS implementation of a map resource loader
 */
export class MapResource {
    private _data: MapData | null = null;
    private _path: string;

    /**
     * Create a new MapResource
     * @param options Options for loading the map
     */
    constructor(options: MapResourceOptions) {
        this._path = options.path;
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
            const file = Gio.File.new_for_path(this._path);
            const [success, contents] = await new Promise<[boolean, Uint8Array]>((resolve) => {
                file.load_contents_async(null, (_, result) => {
                    try {
                        const [success, contents] = file.load_contents_finish(result);
                        resolve([success, contents]);
                    } catch (error) {
                        console.error(`Error loading map file: ${error}`);
                        resolve([false, new Uint8Array()]);
                    }
                });
            });

            if (!success) {
                throw new Error(`Failed to load map file: ${this._path}`);
            }

            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            this._data = JSON.parse(jsonString) as MapData;

            return this._data;
        } catch (error) {
            console.error(`Error parsing map file: ${error}`);
            throw error;
        }
    }

    /**
     * Get the loaded map data
     */
    get data(): MapData | null {
        return this._data;
    }

    /**
     * Get the path to the map file
     */
    get path(): string {
        return this._path;
    }
} 