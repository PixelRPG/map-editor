import type { ResourceOptions } from '../ResourceOptions'
import type { SpriteSetData } from '../data/index'

/**
 * Options for the SpriteSetResource loader
 */
export interface SpriteSetResourceOptions extends ResourceOptions {
  /**
   * When true, only loads the data without loading images
   * Useful for server-side or headless environments
   */
  headless?: boolean

  /**
   * Pre-built {@link SpriteSetData} to bypass JSON-file loading.
   * When set, `load()` skips the `loadTextFile` step and uses this
   * data directly. Used by the engine's bundled assets (e.g. the
   * built-in scientist character) where the sprite-set lives as a
   * TS literal rather than on disk.
   *
   * The data's `image.path` may be a `data:` URL — `loadImage` /
   * `toFetchUrl` pass those through unchanged.
   */
  inlineData?: SpriteSetData
}
