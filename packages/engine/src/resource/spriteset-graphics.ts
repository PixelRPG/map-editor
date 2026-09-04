import {
  Animation,
  type AnimationStrategy,
  type ImageSource,
  Logger,
  type Sprite,
  SpriteSheet,
  type SpriteSheetSpacingDimensions,
} from 'excalibur'
import type { AnimationData, SpriteDataSet, SpriteSetData } from '../types/index.ts'

/**
 * Turning a parsed {@link SpriteSetData} descriptor plus its loaded
 * images into Excalibur graphics.
 *
 * Split from `SpriteSetResource` because that class does two unrelated
 * things: resolve + fetch bytes (paths, `data:` URLs, inline data), and
 * slice those bytes into sprites and animations. Only the second half
 * is platform-independent pure-ish construction, and it is the half a
 * platform-specific subclass may want to reuse against its own images.
 *
 * Every step is lenient by design: a sprite-set is user-authored data
 * that can reference a sheet position or a sprite id that no longer
 * exists, and losing one sprite must not take the whole set (and with
 * it every map that uses it) down.
 */

const logger = Logger.getInstance()

/**
 * Slice `imageSource` into a grid per the descriptor's
 * `rows`/`columns`/`spriteWidth`/`spriteHeight`.
 *
 * Each sprite's `destSize` is pinned to the cell size so transparency
 * and pixel-art scaling survive later cloning.
 */
export function createSpriteSheet(imageSource: ImageSource, data: SpriteSetData): SpriteSheet {
  const hasImage = Boolean(data.image)
  const rows = hasImage ? data.rows : 0
  const columns = hasImage ? data.columns : 0
  const tileWidth = hasImage ? data.spriteWidth : 0
  const tileHeight = hasImage ? data.spriteHeight : 0
  const spacing: SpriteSheetSpacingDimensions | undefined =
    hasImage && data.spacing ? { margin: { x: data.spacing, y: data.spacing } } : undefined

  const spriteSheet = SpriteSheet.fromImageSource({
    image: imageSource,
    grid: { rows, columns, spriteHeight: tileHeight, spriteWidth: tileWidth },
    spacing,
  })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const sprite = spriteSheet.getSprite(col, row)
      if (sprite) {
        sprite.destSize.width = tileWidth
        sprite.destSize.height = tileHeight
      }
    }
  }

  return spriteSheet
}

/**
 * Build the `spriteId → Sprite` map from the descriptor's sprite
 * definitions, resolving each against the sheet its `properties.imageId`
 * names (falling back to the descriptor's own image).
 */
export function createSprites(
  data: SpriteSetData,
  spriteSheets: ReadonlyMap<string, SpriteSheet>,
): Record<number, Sprite> {
  const sprites: Record<number, Sprite> = {}
  if (data.sprites.length === 0) {
    logger.warn('SpriteSet has no sprites defined')
    return sprites
  }

  for (const sprite of data.sprites) {
    const imageId = resolveImageId(sprite, data, spriteSheets)
    const spriteSheet = spriteSheets.get(imageId)
    if (!spriteSheet) {
      logger.warn(`No spritesheet found for image ID ${imageId}`)
      continue
    }
    if (sprite.col < 0 || sprite.row < 0 || sprite.col >= spriteSheet.columns || sprite.row >= spriteSheet.rows) {
      logger.warn(`Sprite ID ${sprite.id} has invalid position (${sprite.col}, ${sprite.row}). Skipping.`)
      continue
    }
    // Excalibur's sheet lookup is the one step here that can throw on a
    // malformed sheet; one bad definition must not abandon the rest.
    try {
      const graphic = spriteSheet.getSprite(sprite.col, sprite.row)
      if (graphic) sprites[sprite.id] = graphic
      else logger.warn(`Failed to get sprite for sprite ID ${sprite.id} at position (${sprite.col}, ${sprite.row})`)
    } catch (error) {
      logger.error(`Error creating sprite for sprite ID ${sprite.id}: ${error}`)
    }
  }

  // Not a throw: an empty set still lets the project open, with the
  // affected tiles rendering blank rather than the editor refusing to load.
  if (Object.keys(sprites).length === 0) {
    logger.error('Failed to create any sprites from the sprite set')
  }
  return sprites
}

function resolveImageId(
  sprite: SpriteDataSet,
  data: SpriteSetData,
  spriteSheets: ReadonlyMap<string, SpriteSheet>,
): string {
  if (!data.image) return 'default'
  const declared = sprite.properties?.imageId
  if (typeof declared === 'string' && spriteSheets.has(declared)) return declared
  return data.image.id
}

/**
 * Build the `animationId → Animation` map. Frames referencing a missing
 * sprite are dropped, and an animation left with no frames is skipped
 * entirely — an `Animation` with zero frames throws at draw time.
 *
 * Each frame gets its OWN sprite clone: Excalibur graphics carry
 * per-instance state (opacity, destSize), so sharing one instance across
 * frames makes a tint applied to one frame bleed into the others.
 */
export function createAnimations(data: SpriteSetData, sprites: Record<number, Sprite>): Record<string, Animation> {
  const animations: Record<string, Animation> = {}
  for (const animation of data.animations ?? []) {
    const frames = buildFrames(animation, sprites)
    if (frames.length === 0) {
      logger.warn(`Animation ${animation.id} has no valid frames and will be skipped`)
      continue
    }
    logger.debug(`Creating animation ${animation.id} with ${frames.length} frames`)
    animations[animation.id] = new Animation({ frames, strategy: animation.strategy as AnimationStrategy })
    logger.debug(`Animation ${animation.id} created with strategy ${animation.strategy}`)
  }
  logger.info(`Created ${Object.keys(animations).length} animations`)
  return animations
}

function buildFrames(
  animation: AnimationData,
  sprites: Record<number, Sprite>,
): Array<{ graphic: Sprite; duration?: number }> {
  const frames: Array<{ graphic: Sprite; duration?: number }> = []
  for (const frame of animation.frames) {
    const sprite = sprites[frame.spriteId]
    if (!sprite) {
      logger.warn(`Animation ${animation.id} references missing sprite ID ${frame.spriteId}`)
      continue
    }
    frames.push({ graphic: sprite.clone(), duration: frame.duration })
  }
  return frames
}
