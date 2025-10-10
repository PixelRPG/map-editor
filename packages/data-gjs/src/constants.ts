import Gio from '@girs/gio-2.0'

// Vite-defined constants (must be declared before usage)
/**
 * Application ID, e.g. "org.pixelrpg.maker"
 * Note: Defined in vite.config.js
 */
export const APPLICATION_ID = __APPLICATION_ID__
export const RESOURCES_PATH = __RESOURCES_PATH__
export const PACKAGE_VERSION = __PACKAGE_VERSION__
export const GJS_CONSOLE = __GJS_CONSOLE__
export const PREFIX = __PREFIX__
export const LIBDIR = __LIBDIR__
export const DATADIR = __DATADIR__
export const BINDIR = __BINDIR__
export const PKGDATADIR = __PKGDATADIR__

// Base directory for the running app; defined via Vite
export const ROOT_DIR = Gio.File.new_for_path(PREFIX)

// Point to the built web client (engine-excalibur) dist directory
export const CLIENT_DIR_PATH = Gio.File.new_for_path(
  PREFIX,
).resolve_relative_path('../../packages/engine-excalibur/dist/')

export const CLIENT_RESOURCE_PATH = '/org/pixelrpg/maker'

/**
 * Custom protocol `pixelrpg://` used for internal communication between the WebView and the main GJS process.
 */
export const INTERNAL_PROTOCOL = 'pixelrpg'

// Maximum value for 32-bit signed integer (GObject int type limit)
export const MAX_INT32 = 2147483647

// (moved define constants to top to avoid TDZ and linter issues)
