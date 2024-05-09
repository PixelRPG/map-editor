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

  normalizePath(path: string, base: string) {
    let relative: string
    let absolute: string
    if (path.startsWith(base)) {
      relative = path.substring(base.length)
      absolute = path;
    } else {
      relative = path;
      absolute = base + path;
    }
    return {
      relative,
      absolute,
    }
  }

  /**
   * Get the resource from the resource file.
   * This is used to load the client files.
   */
  get(path: string) {
    const { relative, absolute } = this.normalizePath(path, this.resourcePath)
    console.log('get', absolute)
    try {
      const data = this.resource.lookup_data(absolute, Gio.ResourceLookupFlags.NONE)
      return data
    } catch (error) {
      console.error('Error opening stream', error)
      return this.getDirect(relative)
    }
  }

  /**
   * Get the resource directly from the file system.
   * This is used to load the client files.
   */
  getDirect(path: string) {
    const { absolute } = this.normalizePath(path, this.fallbackDirPath)
    console.log('get direct', absolute)
    try {
      return Gio.File.new_for_path(absolute).load_contents(null)[1]
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
    const { relative, absolute } = this.normalizePath(path, this.resourcePath)
    console.log('open stream', path)
    try {
      const stream = this.resource.open_stream(
        absolute,
        Gio.ResourceLookupFlags.NONE,
      )
      console.log('stream', stream)
      return stream
    } catch (error) {
      console.error('Error opening stream', error)
      console.log('trying direct')
      return this.streamDirect(relative)
    }
  }

  /**
   * Open a stream to the resource directly from the file system.
   * This is used to load the client files.
   */
  streamDirect(path: string): Gio.FileInputStream | null {
    const { absolute } = this.normalizePath(path, this.fallbackDirPath)
    const file = Gio.File.new_for_path(absolute)
    console.log('open stream direct', absolute)
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
