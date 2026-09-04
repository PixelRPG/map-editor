import {
  type Animation,
  ImageFiltering,
  ImageSource,
  ImageWrapping,
  Logger,
  type Sprite,
  type SpriteSheet,
} from 'excalibur'
import { SpriteSetFormat } from '../format/SpriteSetFormat'
import type { SpriteSetData, SpriteSetResourceOptions } from '../types'
import { loadTextFile, toFetchUrl } from '../utils'
import { extractDirectoryPath, getFilename, isAbsoluteOrUrl, joinPaths } from '../utils/url'
import { createAnimations, createSprites, createSpriteSheet } from './spriteset-graphics.ts'

/**
 * Resource class for loading custom SpriteSet format into Excalibur
 */
export class SpriteSetResource {
  /**
   * The loaded sprite set data
   */
  data!: SpriteSetData

  /**
   * Configuration options
   */
  private readonly headless: boolean = false
  private readonly basePath: string = ''
  private readonly filename: string = ''
  private readonly inlineData?: SpriteSetData

  /**
   * Resource data
   */
  private imageLoaders: Map<string, ImageSource> = new Map()
  private spriteSetData!: SpriteSetData

  /**
   * Processed sprite data
   */
  public sprites: Record<number, Sprite> = {}
  public animations: Record<string, Animation> = {}
  public spriteSheets: Map<string, SpriteSheet> = new Map()

  // Logger for debugging
  private logger = Logger.getInstance()

  constructor(path: string, options?: SpriteSetResourceOptions) {
    this.headless = options?.headless ?? this.headless
    this.basePath = extractDirectoryPath(path)
    this.filename = getFilename(path)
    this.inlineData = options?.inlineData
  }

  /**
   * Get the path to the sprite set file
   */
  get path(): string {
    return joinPaths(this.basePath, this.filename)
  }

  /**
   * Directory the sprite-set's image paths are resolved against.
   *
   * Exposed for the snapshot layer (`captureProjectSnapshot`) so
   * it can read the on-disk PNG bytes and embed them in the wire
   * snapshot — a joiner without a local copy of the project needs
   * the binary asset to render anything.
   *
   * `data.image.path` may be a `data:`/`http(s)://`/`file://` URL,
   * in which case the absolute path doesn't exist on disk and
   * callers should detect the URL form via `isAbsoluteOrUrl` and
   * skip the read.
   */
  get imageBasePath(): string {
    return this.basePath
  }

  /**
   * Loads the images for the sprite set
   */
  private async loadImages(data: SpriteSetData): Promise<Map<string, ImageSource>> {
    const imageLoaders = new Map<string, ImageSource>()

    if (data.image) {
      // `data:` URLs (used by engine-bundled assets like the scientist
      // starter PNG) skip `joinPaths` — that helper splits on `/` and
      // collapses double-slashes via `normalizePath`, which corrupts
      // the base64 payload. http(s) URLs and `file://` URLs are also
      // already-fully-qualified, so we let `loadImage` handle them
      // as-is. Only relative paths go through `joinPaths` for
      // basePath resolution.
      const imagePath = isAbsoluteOrUrl(data.image.path) ? data.image.path : joinPaths(this.basePath, data.image.path)
      try {
        const imageLoader = await this.loadImage(imagePath)
        imageLoaders.set(data.image.id, imageLoader)
      } catch (error) {
        this.logger.error(`Failed to load image ${data.image.id} from: ${imagePath}`, error)
      }
    } else {
      this.logger.warn('SpriteSet has no image defined')
    }

    return imageLoaders
  }

  /**
   * Loads a single image
   */
  private async loadImage(imagePath: string): Promise<ImageSource> {
    // Check if the path is valid
    if (!imagePath) {
      throw new Error('Invalid image path: path is empty')
    }

    // Excalibur's ImageSource fetches the URL as-is; normalize POSIX absolute
    // paths to `file://` so GJS fetch accepts them (and does not treat them
    // as origin-relative against the CWD).
    const imageLoader = new ImageSource(toFetchUrl(imagePath), {
      // Set filtering to preserve pixel art quality
      filtering: ImageFiltering.Pixel,
      // Ensure proper wrapping
      wrapping: ImageWrapping.Clamp,
    })

    try {
      // Load the image
      await imageLoader.load()

      // Check if the image was loaded successfully
      if (imageLoader.isLoaded()) {
        return imageLoader
      } else {
        throw new Error(`Image loaded but isLoaded() returned false: ${imagePath}`)
      }
    } catch (error) {
      this.logger.error(`Failed to load image from: ${imagePath}`, error)
      throw error
    }
  }

  async load(): Promise<SpriteSetData> {
    try {
      // Inline-data mode: the bundled scientist (and any other
      // engine-provided asset) skips the JSON load entirely and feeds
      // pre-built data into the same downstream pipeline. The
      // `image.path` is typically a `data:` URL, which `toFetchUrl`
      // passes through unchanged so `ImageSource` can fetch it.
      if (this.inlineData) {
        this.spriteSetData = this.inlineData
        this.data = this.spriteSetData
      } else {
        // Load the sprite set data
        const spriteSetPath = joinPaths(this.basePath, this.filename)
        const spriteSetText = await loadTextFile(spriteSetPath)
        this.spriteSetData = SpriteSetFormat.deserialize(spriteSetText)
        this.data = this.spriteSetData
      }

      // Load all images
      this.imageLoaders = await this.loadImages(this.spriteSetData)

      for (const [imageId, imageSource] of this.imageLoaders) {
        this.spriteSheets.set(imageId, createSpriteSheet(imageSource, this.spriteSetData))
      }
      this.sprites = createSprites(this.spriteSetData, this.spriteSheets)
      this.animations = createAnimations(this.spriteSetData, this.sprites)

      return this.spriteSetData
    } catch (error) {
      this.logger.error(`Failed to load sprite set: ${error}`)
      throw error
    }
  }

  isLoaded(): boolean {
    return !!this.data
  }

  /**
   * Get a specific sprite by ID
   * @param id Sprite ID
   * @returns Excalibur Sprite object or undefined if not found
   */
  getSprite(id: number): Sprite | undefined {
    return this.sprites[id]
  }

  /**
   * Get a loaded ImageSource by its image ID.
   * Useful for platform-specific subclasses that need to extract native
   * image data (e.g. GdkPixbuf from gjsify's HTMLImageElement polyfill).
   */
  getImageSource(imageId: string): ImageSource | undefined {
    return this.imageLoaders.get(imageId)
  }
}
