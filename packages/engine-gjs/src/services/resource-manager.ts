import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

/**
 * Resource manager for handling internal resources
 */
export class ResourceManager {
    /**
     * Create a new resource manager
     * @param resourcePaths Paths to search for resources
     */
    constructor(private resourcePaths: string[] = []) { }

    /**
     * Add a resource path
     * @param path Path to add
     */
    addPath(path: string) {
        this.resourcePaths.push(path)
    }

    /**
     * Get a stream for a resource
     * @param path Path to the resource
     * @returns A stream for the resource, or null if not found
     */
    stream(path: string): Gio.InputStream | null {
        // Remove leading slash if present
        if (path.startsWith('/')) {
            path = path.substring(1)
        }

        // Try each resource path
        for (const resourcePath of this.resourcePaths) {
            try {
                const fullPath = GLib.build_filenamev([resourcePath, path])
                const file = Gio.File.new_for_path(fullPath)

                if (file.query_exists(null)) {
                    return file.read(null)
                }
            } catch (error) {
                console.error(`Error opening file: ${path}`, error)
            }
        }

        // Try to load from GResource
        try {
            const resourcePath = `/org/pixelrpg/maker/engine-excalibur/${path}`
            return Gio.resources_open_stream(resourcePath, 0)
        } catch (error) {
            // Resource not found, ignore
        }

        return null
    }
} 