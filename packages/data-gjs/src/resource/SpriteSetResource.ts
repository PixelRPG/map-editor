import Gio from '@girs/gio-2.0';
import Gdk from '@girs/gdk-4.0';
import { SpriteSetData } from '@pixelrpg/data-core';
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions';
import { loadTextFile } from '../utils';
import { SpriteSetFormat, Loadable } from '@pixelrpg/data-core';

/**
 * Pure Gdk.Texture sprite set resource loader
 * 
 * 🚀 ZERO GdkPixbuf dependencies - unified texture-based architecture!
 * Scaling handled at widget level for optimal performance.
 */
export class SpriteSetResource implements Loadable<SpriteSetData> {
    private _data: SpriteSetData | null = null;
    private _path: string;
    private _texture: Gdk.Texture | null = null;
    private _useGResource: boolean;
    private _resourcePrefix: string | undefined = undefined;

    /**
     * Create a new SpriteSetResource
     * @param path The path to the sprite set file
     */
    constructor(path: string, options?: SpriteSetResourceOptions) {
        this._path = path;
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
            if (this._data.image) {
                const imagePath = this._data.image.path;
                // If the image path is relative, resolve it relative to the JSON file
                const absoluteImagePath = imagePath.startsWith('/')
                    ? imagePath
                    : Gio.File.new_for_path(this._path).get_parent()?.get_child(imagePath).get_path() || imagePath;

                try {
                    // Load texture directly from file (pure GTK4 approach)
                    const file = Gio.File.new_for_path(absoluteImagePath);
                    this._texture = Gdk.Texture.new_from_file(file);

                    // Note: Scaling is now handled at the widget level (Gtk.Picture)
                    // The scale factor is preserved for widget-level scaling
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
    get data(): SpriteSetData {
        if (!this._data) {
            throw new Error('Sprite set data not loaded');
        }
        return this._data;
    }

    /**
     * Get the path to the sprite set file
     */
    get path(): string {
        return this._path;
    }

    /**
     * Get the loaded texture for the sprite set image
     */
    get texture(): Gdk.Texture | null {
        return this._texture;
    }

    /**
     * Get the loaded pixbuf (legacy compatibility - deprecated)
     * @deprecated Use .texture instead for modern GTK4 architecture
     */
    get pixbuf(): Gdk.Texture | null {
        return this._texture;
    }

    /**
     * Check if the resource is loaded
     * @returns True if the resource is loaded
     */
    isLoaded(): boolean {
        return this._data !== null;
    }
} 