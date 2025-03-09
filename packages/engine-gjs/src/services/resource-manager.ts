import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'

/**
 * Resource manager for handling internal resources
 */
export class ResourceManager {
    /**
     * Create a new resource manager
     * @param resourcePaths Paths to search for resources
     * @param gresourcePath Optional path prefix for GResource lookups
     */
    constructor(
        private resourcePaths: string[] = [CLIENT_DIR_PATH.get_path()!, CLIENT_RESOURCE_PATH],
        private gresourcePath: string = '/org/pixelrpg/maker/engine-excalibur'
    ) { }

    /**
     * Add a resource path
     * @param path Path to add
     */
    addPath(path: string) {
        this.resourcePaths.push(path)
    }

    /**
     * Set the GResource path prefix
     * @param path The GResource path prefix
     */
    setGResourcePath(path: string) {
        this.gresourcePath = path
    }

    /**
     * Normalize a path by removing protocol prefixes and leading slashes
     * @param path The path to normalize
     * @returns The normalized path
     */
    private normalizePath(path: string): string {
        // Remove protocol prefix if present (e.g., pixelrpg://)
        if (path.includes('://')) {
            path = path.split('://')[1]
        }

        // Remove leading slash if present
        if (path.startsWith('/')) {
            path = path.substring(1)
        }

        return path
    }

    /**
     * Get a stream for a resource
     * @param path Path to the resource
     * @returns A stream for the resource, or null if not found
     */
    stream(path: string): Gio.InputStream | null {
        const normalizedPath = this.normalizePath(path)

        // Try each resource path first (direct file access)
        for (const resourcePath of this.resourcePaths) {
            try {
                const fullPath = GLib.build_filenamev([resourcePath, normalizedPath])
                const file = Gio.File.new_for_path(fullPath)

                if (file.query_exists(null)) {
                    console.log(`Loading file from path: ${fullPath}`)
                    return file.read(null)
                }
            } catch (error) {
                console.error(`Error opening file: ${normalizedPath}`, error)
            }
        }

        // Try to load from GResource
        try {
            // First try with the exact path
            let resourcePath = `${this.gresourcePath}/${normalizedPath}`
            console.log(`Trying to load GResource: ${resourcePath}`)

            try {
                return Gio.resources_open_stream(resourcePath, 0)
            } catch (error) {
                // If that fails, try without the gresourcePath prefix
                // This handles cases where the path already includes the prefix
                if (normalizedPath.includes(this.gresourcePath.substring(1))) {
                    resourcePath = `/${normalizedPath}`
                    console.log(`Trying alternative GResource path: ${resourcePath}`)
                    return Gio.resources_open_stream(resourcePath, 0)
                }
                throw error
            }
        } catch (error) {
            console.error(`Error opening resource: ${path}`, error)
        }

        return null
    }
}