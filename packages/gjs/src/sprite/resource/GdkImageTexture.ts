import GLib from '@girs/glib-2.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'

/**
 * GObject wrapper around a `Gdk.Texture` loaded from a local file.
 *
 * Used by GTK widgets (via `GdkSpritePaintable` / `Gtk.Picture`) to render
 * sprite previews. Distinct from Excalibur's `ex.ImageSource` (which expects a
 * URL/HTMLImageElement); both pipelines coexist intentionally.
 */
export class GdkImageTexture extends GObject.Object {
  private _path: string
  private _texture: Gdk.Texture | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'GdkImageTexture',
        Properties: {
          texture: GObject.ParamSpec.object(
            'texture',
            'Texture',
            'Texture for the image',
            GObject.ParamFlags.READWRITE,
            Gdk.Texture,
          ),
        },
      },
      this,
    )
  }

  /** Create a GdkImageTexture directly from an already-loaded Gdk.Texture. */
  static fromTexture(texture: Gdk.Texture): GdkImageTexture {
    const imageTexture = new GdkImageTexture('')
    imageTexture._texture = texture
    return imageTexture
  }

  constructor(path: string) {
    super()
    this._path = path
  }

  get texture(): Gdk.Texture | null {
    return this._texture
  }

  set texture(value: Gdk.Texture | null) {
    if (this._texture === value) return
    this._texture = value
    this.notify('texture')
  }

  /**
   * Load the texture from the configured path. Relative paths resolve against
   * the current working directory.
   */
  async load(): Promise<Gdk.Texture> {
    if (this._texture) {
      return this._texture
    }

    const absolute = GLib.path_is_absolute(this._path)
      ? this._path
      : GLib.build_filenamev([GLib.get_current_dir(), this._path])

    const file = Gio.File.new_for_path(absolute)
    this._texture = Gdk.Texture.new_from_file(file)

    if (!this._texture) {
      throw new Error(`Failed to load texture from ${this._path}`)
    }

    return this._texture
  }

  get data(): Gdk.Texture {
    if (!this._texture) {
      throw new Error('No texture data available')
    }
    return this._texture
  }

  get width(): number {
    if (!this._texture) {
      throw new Error('No texture data available')
    }
    return this._texture.get_width()
  }

  get height(): number {
    if (!this._texture) {
      throw new Error('No texture data available')
    }
    return this._texture.get_height()
  }

  get path(): string {
    return this._path
  }

  isLoaded(): boolean {
    return this._texture !== null
  }

  hasTexture(): boolean {
    return this._texture !== null
  }
}
