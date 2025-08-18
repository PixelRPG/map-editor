import type { ImageReference, Loadable } from '@pixelrpg/data-core'
import { loadTextFile } from '../utils'
import GLib from '@girs/glib-2.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'

/**
 * Pure Gdk.Texture image resource - 100% modern GTK4 architecture
 * 
 * 🚀 ZERO GdkPixbuf dependencies - direct texture loading and storage!
 * Scaling handled at widget level for clean separation of concerns.
 */
export class ImageResource extends GObject.Object implements Loadable<Gdk.Texture> {
    private _path: string;
    private _useGResource: boolean;
    private _resourcePrefix: string | undefined;

    // Pure texture-based storage
    private _texture: Gdk.Texture | null = null

    static {
        GObject.registerClass({
            GTypeName: 'Image',
            Properties: {
                texture: GObject.ParamSpec.object('texture', 'Texture', 'Texture for the image', GObject.ParamFlags.READWRITE, Gdk.Texture),
            }
        }, this);
    }

    // Removed: fromPixbuf method - pure texture architecture only

    /**
     * Create an ImageResource directly from a Gdk.Texture
     */
    static fromTexture(texture: Gdk.Texture) {
        const imageResource = new ImageResource('', {
            useGResource: false,
            resourcePrefix: ''
        })
        imageResource._texture = texture
        return imageResource
    }


    /**
     * Create a new ImageResource
     * @param path The path to the image file
     * @param options Configuration options
     */
    constructor(path: string, options?: {
        useGResource?: boolean;
        resourcePrefix?: string;
    }) {
        super()
        this._path = path;
        this._useGResource = options?.useGResource || false;
        this._resourcePrefix = options?.resourcePrefix;
    }

    /**
     * Load the image from the file
     * @returns Promise that resolves with the loaded texture
     */
    async load(): Promise<Gdk.Texture> {
        if (this._texture) {
            return this._texture;
        }

        try {
            let absolute: string;

            if (this._useGResource) {
                // Handle GResource paths
                const prefix = this._resourcePrefix || '';
                const resourcePath = prefix + this._path;
                const file = Gio.File.new_for_uri(`resource://${resourcePath}`);
                absolute = file.get_path() || resourcePath;
            } else {
                // Handle regular file paths
                if (!GLib.path_is_absolute(this._path)) {
                    // If path is relative, make it absolute
                    const currentDir = GLib.get_current_dir();
                    absolute = GLib.build_filenamev([currentDir, this._path]);
                } else {
                    absolute = this._path;
                }
            }

            // Load texture directly from file (pure GTK4 approach)
            const file = Gio.File.new_for_path(absolute);
            this._texture = Gdk.Texture.new_from_file(file);

            // Note: Scaling is now handled at the widget level (Gtk.Picture)
            // This keeps the texture data pure and allows for dynamic scaling

            if (!this._texture) {
                throw new Error(`Failed to load texture from ${this._path}`);
            }

            return this._texture;
        } catch (error) {
            console.error(`Error loading image: ${error}`);
            throw error;
        }
    }

    /**
     * Get the loaded texture (modern approach)
     */
    get texture(): Gdk.Texture {
        if (!this._texture) {
            throw new Error('Image texture not loaded');
        }
        return this._texture;
    }

    /**
     * Get the loaded data (returns texture for Loadable interface compatibility)
     */
    get data(): Gdk.Texture {
        return this.texture;
    }

    /**
     * Get image dimensions from texture
     */
    get width(): number {
        if (!this._texture) {
            throw new Error('No texture data available');
        }
        return this._texture.get_width();
    }

    get height(): number {
        if (!this._texture) {
            throw new Error('No texture data available');
        }
        return this._texture.get_height();
    }

    /**
     * Get the path to the image file
     */
    get path(): string {
        return this._path;
    }

    /**
     * Check if the resource is loaded
     */
    isLoaded(): boolean {
        return this._texture !== null;
    }

    /**
     * Check if texture is available
     */
    hasTexture(): boolean {
        return this._texture !== null;
    }
}