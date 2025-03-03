import Gio from '@girs/gio-2.0'

export const APPLICATION_ID = 'org.pixelrpg.maker'

export const ROOT_DIR = Gio.File.new_for_uri(
  import.meta.url,
).resolve_relative_path('../..')

export const CLIENT_DIR_PATH = ROOT_DIR.resolve_relative_path('../../packages/engine-excalibur/dist/')

export const CLIENT_RESOURCE_PATH = '/org/pixelrpg/maker/engine-excalibur'

/** 
 * Custom protocol `pixelrpg://` used for internal communication between the WebView and the main GJS process.
 */
export const INTERNAL_PROTOCOL = 'pixelrpg'