import { ResourceManager } from './resource.manager.ts'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../constants.ts'

export const clientResourceManager = new ResourceManager(
    './org.pixelrpg.map-editor.data.gresource',
    CLIENT_RESOURCE_PATH,
    CLIENT_DIR_PATH.get_path()!,
)
