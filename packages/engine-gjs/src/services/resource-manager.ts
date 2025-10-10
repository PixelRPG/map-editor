import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import Gtk from '@girs/gtk-4.0'
import Gdk from '@girs/gdk-4.0'
import GtkSource from '@girs/gtksource-5'
import {
  CLIENT_DIR_PATH,
  CLIENT_RESOURCE_PATH,
  APPLICATION_ID,
  RESOURCES_PATH,
  PKGDATADIR,
} from '@pixelrpg/data-gjs'

/**
 * Resource manager for handling internal resources, GResource registration, and icon themes
 */
export class ResourceManager {
  private _initialized = false
  private readonly logPrefix = '[ResourceManager]'

  /**
   * Create a new resource manager
   * @param resourcePaths Paths to search for resources
   * @param gresourcePath Optional path prefix for GResource lookups
   */
  constructor(
    private resourcePaths: string[] = [
      CLIENT_DIR_PATH.get_path()!,
      CLIENT_RESOURCE_PATH,
    ],
    private _gresourcePath: string = '/org/pixelrpg/maker',
  ) {}

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
   * Check if the resource manager has been initialized
   * @returns True if initialized, false otherwise
   */
  get initialized(): boolean {
    return this._initialized
  }

  /**
   * Initialize GResource data and icon themes
   * This method should be called once during application startup
   * @throws Error if initialization fails
   */
  initialize(): void {
    if (this._initialized) {
      console.log(`${this.logPrefix} Already initialized`)
      return
    }

    try {
      console.log(`${this.logPrefix} Initializing...`)
      this.registerGResource()
      this.registerIconTheme()
      this.registerGtkSource()
      this._initialized = true
      console.log(`${this.logPrefix} Initialized successfully`)
    } catch (error) {
      console.error(`${this.logPrefix} Failed to initialize`, error)
      throw error
    }
  }

  /**
   * Register GResource data from the application's data directory
   * @throws Error if the resource data path is not found or cannot be loaded
   */
  private registerGResource(): void {
    const resourceDataPath = Gio.File.new_for_path(PKGDATADIR)
      .resolve_relative_path(`./${APPLICATION_ID}.data.gresource`)
      .get_path()

    if (!resourceDataPath) {
      throw new Error('Resource data path not found')
    }

    const resourceData = Gio.Resource.load(resourceDataPath)
    Gio.resources_register(resourceData)

    console.log(`${this.logPrefix} Registered GResource at ${resourceDataPath}`)
  }

  /**
   * Register icon theme paths
   * @throws Error if display is not available
   */
  private registerIconTheme(): void {
    const display = Gdk.Display.get_default()
    if (!display) {
      throw new Error('Display not found')
    }

    const theme = Gtk.IconTheme.get_for_display(display)
    theme.add_resource_path(`${RESOURCES_PATH}/icons`)

    console.log(
      `${this.logPrefix} Registered icon theme at ${RESOURCES_PATH}/icons`,
    )
  }

  /**
   * Register GtkSourceView language specs and style schemes from resources
   */
  private registerGtkSource(): void {
    const languageManager = GtkSource.LanguageManager.get_default()
    const searchPath = languageManager.get_search_path()
    if (!searchPath) {
      throw new Error('Search path not found')
    }
    languageManager.set_search_path([
      `resource://${RESOURCES_PATH}/lang-specs`,
      ...searchPath,
    ])

    const schemeManager = GtkSource.StyleSchemeManager.get_default()
    const schemePaths = schemeManager.get_search_path()
    schemeManager.set_search_path([
      `resource://${RESOURCES_PATH}/schemas`,
      ...schemePaths,
    ])

    console.log(
      `${this.logPrefix} Registered GtkSource language specs and style schemes`,
    )
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
   * Normalize a path by removing protocol prefixes
   * @param path The path to normalize
   * @returns The normalized path
   */
  private normalizePath(path: string): string {
    // Remove protocol prefix if present (e.g., pixelrpg://)
    if (path.includes('://')) {
      path = path.split('://')[1]
    }

    // Remove leading slash for relative paths
    if (path.startsWith('/') && !this.isAbsolutePath(path)) {
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

    // Try absolute filesystem path first
    if (this.isAbsolutePath(normalizedPath)) {
      try {
        const file = Gio.File.new_for_path(normalizedPath)
        if (file.query_exists(null)) {
          return file.read(null)
        }
      } catch (error) {
        console.error(`Error opening file: ${normalizedPath}`, error)
      }
    }

    // Try resource paths
    for (const resourcePath of this.resourcePaths) {
      try {
        const fullPath = GLib.build_filenamev([resourcePath, normalizedPath])
        const file = Gio.File.new_for_path(fullPath)
        if (file.query_exists(null)) {
          return file.read(null)
        }
      } catch (error) {
        // Continue to next resource path
      }
    }

    // Try GResource
    try {
      const resourcePath = `${this._gresourcePath}/${normalizedPath}`
      return Gio.resources_open_stream(resourcePath, 0)
    } catch (error) {
      console.error(`Resource not found: ${path}`, error)
    }

    return null
  }
}
