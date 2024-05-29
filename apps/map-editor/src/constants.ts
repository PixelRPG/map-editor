import Gio from '@girs/gio-2.0'

export const APPLICATION_ID = 'org.pixelrpg.map-editor'

export const ROOT_DIR = Gio.File.new_for_uri(
  import.meta.url,
).resolve_relative_path('../..')

export const CLIENT_DIR_PATH = ROOT_DIR.resolve_relative_path('../../packages/client/dist/')

export const CLIENT_RESOURCE_PATH = '/org/pixelrpg/map-editor/client'

/** Used for internal communication between the WebView and the main GJS process. */
export const INTERNAL_PROTOCOL = 'pixelrpg'