import Gio from '@girs/gio-2.0';
import GdkPixbuf from '@girs/gdkpixbuf-2.0';
import { SpriteSetData } from '@pixelrpg/data-core';
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions';
import { loadTextFile } from '../utils';
import { SpriteSetFormat } from '@pixelrpg/data-core';

/**
 * GJS implementation of a sprite set resource loader
 */
export class SpriteSetResource {
    private _data: SpriteSetData | null = null;
    private _path: string;
    private _scale: number;
    private _pixbuf: GdkPixbuf.Pixbuf | null = null;
    private _useGResource: boolean;
    private _resourcePrefix: string | undefined = undefined;

    /**
     * Create a new SpriteSetResource
     * @param path The path to the sprite set file
     */
    constructor(path: string, options?: SpriteSetResourceOptions) {
        this._path = path;
        this._scale = options?.scale || 1;
        this._useGResource = options?.useGResource || false;
        this._resourcePrefix = options?.resourcePrefix || undefined;
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
            // Load and parse the sprite set data
            const spriteSetText = await loadTextFile(
                this._path,
                this._useGResource,
                this._resourcePrefix
            );
            this._data = SpriteSetFormat.deserialize(spriteSetText);

            // Now load the image if it exists
            if (this._data.images?.length) {
                const imagePath = this._data.images[0].path;
                // If the image path is relative, resolve it relative to the JSON file
                const absoluteImagePath = imagePath.startsWith('/')
                    ? imagePath
                    : Gio.File.new_for_path(this._path).get_parent()?.get_child(imagePath).get_path() || imagePath;

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