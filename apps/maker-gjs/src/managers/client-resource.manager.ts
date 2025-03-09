import { ResourceManager } from './resource.manager.ts'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '@pixelrpg/engine-gjs'

export const clientResourceManager = new ResourceManager(
    './org.pixelrpg.maker.data.gresource',
    CLIENT_RESOURCE_PATH,
    CLIENT_DIR_PATH.get_path()!,
)
