import Gio from '@girs/gio-2.0';
import GdkPixbuf from '@girs/gdkpixbuf-2.0';
import { SpriteSetData } from '@pixelrpg/data-core';
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions';

/**
 * GJS implementation of a sprite set resource loader
 */
export class SpriteSetResource {
    private _data: SpriteSetData | null = null;
    private _path: string;
    private _scale: number;
    private _pixbuf: GdkPixbuf.Pixbuf | null = null;

    /**
     * Create a new SpriteSetResource
     * @param options Options for loading the sprite set
     */
    constructor(options: SpriteSetResourceOptions) {
        this._path = options.path;
        this._scale = options.scale || 1;
    }

    /**
     * Load the sprite set data from the file
     * @returns Promise that resolves when the sprite set is loaded
     */
    async load(): Promise<SpriteSetData> {
        if (this._data) {
            return this._data;
        }

        try {
            // First load the JSON metadata
            const jsonPath = this._path;
            const jsonFile = Gio.File.new_for_path(jsonPath);

            const [success, contents] = await new Promise<[boolean, Uint8Array]>((resolve) => {
                jsonFile.load_contents_async(null, (_, result) => {
                    try {
                        const [success, contents] = jsonFile.load_contents_finish(result);
                        resolve([success, contents]);
                    } catch (error) {
                        console.error(`Error loading sprite set file: ${error}`);
                        resolve([false, new Uint8Array()]);
                    }
                });
            });

            if (!success) {
                throw new Error(`Failed to load sprite set file: ${jsonPath}`);
            }

            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            this._data = JSON.parse(jsonString) as SpriteSetData;

            // Now load the image if it exists
            if (this._data.images?.length) {
                const imagePath = this._data.images[0].path;
                // If the image path is relative, resolve it relative to the JSON file
                const absoluteImagePath = imagePath.startsWith('/')
                    ? imagePath
                    : Gio.File.new_for_path(jsonPath).get_parent()?.get_child(imagePath).get_path() || imagePath;

                try {
                    this._pixbuf = GdkPixbuf.Pixbuf.new_from_file(absoluteImagePath);

                    // Apply scaling if needed
                    if (this._scale !== 1) {
                        const width = this._pixbuf.get_width() * this._scale;
                        const height = this._pixbuf.get_height() * this._scale;
                        this._pixbuf = this._pixbuf.scale_simple(
                            width,
                            height,
                            GdkPixbuf.InterpType.NEAREST
                        );
                    }
                } catch (error) {
                    console.error(`Error loading sprite set image: ${error}`);
                }
            }

            return this._data;
        } catch (error) {
            console.error(`Error parsing sprite set file: ${error}`);
            throw error;
        }
    }

    /**
     * Get the loaded sprite set data
     */
    get data(): SpriteSetData | null {
        return this._data;
    }

    /**
     * Get the path to the sprite set file
     */
    get path(): string {
        return this._path;
    }

    /**
     * Get the loaded pixbuf for the sprite set image
     */
    get pixbuf(): GdkPixbuf.Pixbuf | null {
        return this._pixbuf;
    }
} 