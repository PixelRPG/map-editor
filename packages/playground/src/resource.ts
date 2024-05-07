import Gio from '@girs/gio-2.0'

import { ROOT_DIR, CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from './constants'

// Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

class Resource {
  resource: Gio.Resource

  constructor(
    resourceFilePath: string,
    readonly resourcePath: string,
    readonly fallbackDirPath: string,
  ) {
    const path = ROOT_DIR.resolve_relative_path(resourceFilePath).get_path()!
    this.resource = Gio.Resource.load(path)
    this.register(this.resource)
  }

  /**
   * Register the resource with the Gio system globally.
   * @param resource The resource to register.
   */
  register(resource: Gio.Resource) {
    Gio.resources_register(resource)
  }

  normalizePath(path: string) {
    if (!path.startsWith(this.resourcePath)) {
      path = this.resourcePath + path
    }
    return path
  }

  /**
   * Get the resource from the resource file.
   * This is used to load the client files.
   */
  get(path: string) {
    console.log('get', path)
    if (!path.startsWith(this.resourcePath)) {
      console.log(
        'path not starting with resourcePath',
        path,
        this.resourcePath,
      )
      path = this.resourcePath + path
    }
    try {
      const data = this.resource.lookup_data(path, Gio.ResourceLookupFlags.NONE)
      return data
    } catch (error) {
      console.error('Error opening stream', error)
      return this.getDirect(path)
    }
  }

  /**
   * Get the resource directly from the file system.
   * This is used to load the client files.
   */
  getDirect(path: string) {
    if (!path.startsWith(this.fallbackDirPath)) {
      path = this.fallbackDirPath + '/' + path
    }
    console.log('get direct', path)
    try {
      return Gio.File.new_for_path(path).load_contents(null)[1]
    } catch (error) {
      console.error('Error opening stream', error)
      return null
    }
  }

  /**
   * Open a stream to the resource.
   * This is used to load the client files.
   */
  stream(path: string): Gio.InputStream | null {
    console.log('open stream', path)
    if (!path.startsWith(this.resourcePath)) {
      console.log(
        'path not starting with resourcePath',
        path,
        this.resourcePath,
      )
      path = this.resourcePath + path
    }
    const basename = path.split('/').pop()!
    try {
      const stream = this.resource.open_stream(
        path,
        Gio.ResourceLookupFlags.NONE,
      )
      console.log('stream', stream)
      return stream
    } catch (error) {
      console.error('Error opening stream', error)
      console.log('trying direct')
      return this.streamDirect(basename)
    }
  }

  /**
   * Open a stream to the resource directly from the file system.
   * This is used to load the client files.
   */
  streamDirect(path: string): Gio.FileInputStream | null {
    if (!path.startsWith(this.fallbackDirPath)) {
      path = this.fallbackDirPath + '/' + path
    }
    console.log('open stream direct', path)
    const file = Gio.File.new_for_path(path)
    try {
      const stream = file.read(null)
      return stream
    } catch (error) {
      console.error('Error opening stream direct', error)
      return null
    }
  }
}

export const clientResource = new Resource(
  './org.pixelrpg.map-editor.data.gresource',
  CLIENT_RESOURCE_PATH,
  CLIENT_DIR_PATH.get_path()!,
)
