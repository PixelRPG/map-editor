import Gio from '@girs/gio-2.0'

/**
 * Application ID, e.g. "org.pixelrpg.maker"
 * Defined via esbuild `define` in gjsify.config.js.
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

export const ROOT_DIR = Gio.File.new_for_path(PREFIX)

/** Maximum value for 32-bit signed integer (GObject int type limit) */
export const MAX_INT32 = 2147483647
