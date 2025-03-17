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
        private _gresourcePath: string = '/org/pixelrpg/maker/engine-excalibur'
    ) { }

    /**
     * Get the GResource path prefix
     */
    get gresourcePath(): string {
        return this._gresourcePath
    }

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
        this._gresourcePath = path
    }

    /**
     * Check if a path is absolute
     * @param path The path to check
     * @returns True if the path is absolute, false otherwise
     */
    private isAbsolutePath(path: string): boolean {
        // Check for Unix-style absolute paths
        if (path.startsWith('/')) {
            return true
        }

        // Check for Windows-style absolute paths (e.g., C:\path or C:/path)
        if (/^[a-zA-Z]:[/\\]/.test(path)) {
            return true
        }

        return false
    }

    /**
     * Normalize a path by removing protocol prefixes and handling leading slashes
     * @param path The path to normalize
     * @returns The normalized path and a flag indicating if it's an absolute path
     */
    private normalizePath(path: string): { normalizedPath: string, isAbsolute: boolean } {
        let isAbsolute = this.isAbsolutePath(path)

        // Remove protocol prefix if present (e.g., pixelrpg://)
        if (path.includes('://')) {
            path = path.split('://')[1]
            isAbsolute = this.isAbsolutePath(path)
        }

        // For non-absolute paths, remove leading slash if present
        if (!isAbsolute && path.startsWith('/')) {
            path = path.substring(1)
        }

        return { normalizedPath: path, isAbsolute }
    }

    /**
     * Get a stream for a resource
     * @param path Path to the resource
     * @returns A stream for the resource, or null if not found
     */
    stream(path: string): Gio.InputStream | null {
        const { normalizedPath, isAbsolute } = this.normalizePath(path)

        // If the path is absolute, try to load it directly
        if (isAbsolute) {
            try {
                const file = Gio.File.new_for_path(normalizedPath)

                if (file.query_exists(null)) {
                    console.log(`Loading file from absolute path: ${normalizedPath}`)
                    return file.read(null)
                }
            } catch (error) {
                console.error(`Error opening absolute file: ${normalizedPath}`, error)
            }
        }

        // Try each resource path (direct file access)
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
            let resourcePath = `${this._gresourcePath}/${normalizedPath}`
            console.log(`Trying to load GResource: ${resourcePath}`)

            try {
                return Gio.resources_open_stream(resourcePath, 0)
            } catch (error) {
                // If that fails, try without the gresourcePath prefix
                // This handles cases where the path already includes the prefix
                if (normalizedPath.includes(this._gresourcePath.substring(1))) {
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