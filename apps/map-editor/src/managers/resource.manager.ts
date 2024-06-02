import Gio from '@girs/gio-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'

import { ROOT_DIR, INTERNAL_PROTOCOL } from '../constants.ts'

// TODO(ts-for-gir): Fix promise type
// Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

export class ResourceManager {
  gioResource: Gio.Resource

  constructor(
    resourceFilePath: string,
    readonly resourcePath: string,
    readonly fallbackDirPath: string,
    readonly allowedProtocols: string[] = ['file', INTERNAL_PROTOCOL],
  ) {
    const path = ROOT_DIR.resolve_relative_path(resourceFilePath).get_path()!
    this.gioResource = Gio.Resource.load(path)
    this.register(this.gioResource)
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

    if (path.startsWith(INTERNAL_PROTOCOL + '://')) {
      path = path.substring(INTERNAL_PROTOCOL.length + 3)
    }

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
    try {
      const data = this.gioResource.lookup_data(absolute, Gio.ResourceLookupFlags.NONE)
      return data
    } catch (error) {
      console.warn('Error opening stream, try to load from file system..', error)
      return this.getDirect(relative)
    }
  }

  /**
   * Get the resource directly from the file system.
   * This is used to load the client files.
   */
  getDirect(path: string) {
    const { absolute } = this.normalizePath(path, this.fallbackDirPath)
    try {
      return Gio.File.new_for_path(absolute).load_bytes(null)[0]
    } catch (error) {
      console.error('Error opening stream', error)
      return null
    }
  }

  getPixbuf(path: string) {
    const { absolute } = this.normalizePath(path, this.fallbackDirPath)
    try {
      // TODO: Use `this.get` to get the bytes from the pre-cached resource
      const pixbuf = GdkPixbuf.Pixbuf.new_from_file(absolute)
      return pixbuf
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
    try {
      const stream = this.gioResource.open_stream(
        absolute,
        Gio.ResourceLookupFlags.NONE,
      )
      return stream
    } catch (error) {
      console.warn('Error opening stream, try to load from file system..', error)
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
    try {
      const stream = file.read(null)
      return stream
    } catch (error) {
      console.error('Error opening stream direct', error)
      return null
    }
  }
}
