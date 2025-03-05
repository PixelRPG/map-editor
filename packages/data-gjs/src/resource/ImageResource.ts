import type { ImageReference, Loadable } from '@pixelrpg/data-core'
import { loadTextFile } from '../utils'
import GLib from '@girs/glib-2.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'

/**
 * GJS implementation of an image resource loader
 */
export class ImageResource extends GObject.Object implements Loadable<GdkPixbuf.Pixbuf> {
    private _path: string;
    private _scale: number;
    private _useGResource: boolean;
    private _resourcePrefix: string | undefined;

    private _pixbuf: GdkPixbuf.Pixbuf | null = null

    static {
        GObject.registerClass({
            GTypeName: 'Image',
            // Template,
            Properties: {
                // TODO(ts-for-gir): fix type of flags parameter
                pixbuf: GObject.ParamSpec.object('pixbuf', 'Pixbuf', 'Pixbuf for the image', GObject.ParamFlags.READWRITE as any, GdkPixbuf.Pixbuf),
            }
        }, this);
    }

    static fromPixbuf(pixbuf: GdkPixbuf.Pixbuf) {
        const imageResource = new ImageResource('', {
            scale: 1,
            useGResource: false,
            resourcePrefix: ''
        })
        imageResource._pixbuf = pixbuf
        return imageResource
    }


    /**
     * Create a new ImageResource
     * @param path The path to the image file
     * @param options Configuration options
     */
    constructor(path: string, options?: {
        scale?: number;
        useGResource?: boolean;
        resourcePrefix?: string;
    }) {
        super()
        this._path = path;
        this._scale = options?.scale || 1;
        this._useGResource = options?.useGResource || false;
        this._resourcePrefix = options?.resourcePrefix;
    }

    /**
     * Load the image from the file
     * @returns Promise that resolves with the loaded pixbuf
     */
    async load(): Promise<GdkPixbuf.Pixbuf> {
        if (this._pixbuf) {
            return this._pixbuf;
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

            // Load the pixbuf from file
            this._pixbuf = GdkPixbuf.Pixbuf.new_from_file(absolute);

            // Apply scaling if needed
            if (this._scale !== 1 && this._pixbuf) {
                const width = this._pixbuf.get_width() * this._scale;
                const height = this._pixbuf.get_height() * this._scale;
                this._pixbuf = this._pixbuf.scale_simple(
                    width,
                    height,
                    GdkPixbuf.InterpType.BILINEAR
                );
            }

            if (!this._pixbuf) {
                throw new Error(`Failed to load image from ${this._path}`);
            }

            return this._pixbuf;
        } catch (error) {
            console.error(`Error loading image: ${error}`);
            throw error;
        }
    }

    /**
     * Get the loaded pixbuf
     */
    get data(): GdkPixbuf.Pixbuf {
        if (!this._pixbuf) {
            throw new Error('Image not loaded');
        }
        return this._pixbuf;
    }

    /**
     * Get the path to the image file
     */
    get path(): string {
        return this._path;
    }

    /**
     * Check if the resource is loaded
     * @returns True if the resource is loaded
     */
    isLoaded(): boolean {
        return this._pixbuf !== null;
    }
}