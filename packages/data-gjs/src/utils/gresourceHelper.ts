import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';

/**
 * Helper class for working with GResource files
 */
export class GResourceHelper {
    private _resourcePath: string;

    /**
     * Create a new GResourceHelper
     * @param resourcePath Path to the GResource file
     */
    constructor(resourcePath: string) {
        this._resourcePath = resourcePath;
    }

    /**
     * Register the GResource with the system
     * @returns True if the resource was registered successfully
     */
    register(): boolean {
        try {
            const resource = Gio.Resource.load(this._resourcePath);
            Gio.resources_register(resource);
            return true;
        } catch (error) {
            console.error(`Error registering GResource: ${error}`);
            return false;
        }
    }

    /**
     * List all files in a GResource directory
     * @param directory Directory path within the GResource
     * @returns Array of file paths
     */
    listFiles(directory: string): string[] {
        try {
            return Gio.resources_enumerate_children(directory, Gio.ResourceLookupFlags.NONE);
        } catch (error) {
            console.error(`Error listing GResource files: ${error}`);
            return [];
        }
    }

    /**
     * Check if a file exists in the GResource
     * @param path Path to the file within the GResource
     * @returns True if the file exists
     */
    fileExists(path: string): boolean {
        return Gio.resources_get_info(path, Gio.ResourceLookupFlags.NONE) !== null;
    }

    /**
     * Load a file from the GResource
     * @param path Path to the file within the GResource
     * @returns The file contents as a Uint8Array, or null if the file doesn't exist
     */
    loadFile(path: string): Uint8Array | null {
        try {
            const data = Gio.resources_lookup_data(path, Gio.ResourceLookupFlags.NONE);
            if (data) {
                return new Uint8Array(data.get_data()!);
            }
            return null;
        } catch (error) {
            console.error(`Error loading GResource file: ${error}`);
            return null;
        }
    }

    /**
     * Load a text file from the GResource
     * @param path Path to the file within the GResource
     * @returns The file contents as a string, or null if the file doesn't exist
     */
    loadTextFile(path: string): string | null {
        const data = this.loadFile(path);
        if (!data) {
            return null;
        }

        const decoder = new TextDecoder('utf-8');
        return decoder.decode(data);
    }

    /**
     * Get a file object for a file in the GResource
     * @param path Path to the file within the GResource
     * @returns A Gio.File object
     */
    getFile(path: string): Gio.File {
        return Gio.File.new_for_uri(`resource://${path}`);
    }
} 