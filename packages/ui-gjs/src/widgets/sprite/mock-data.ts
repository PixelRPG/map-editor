import GLib from '@girs/glib-2.0'
import Gdk from '@girs/gdk-4.0'
import { SpriteResource } from '@pixelrpg/data-gjs'

/**
 * Pure GdkMemoryTexture-based sprite mock data creation
 *
 * 🚀 ZERO GdkPixbuf dependencies - 100% modern GTK4 architecture!
 * All sprite patterns are created directly as GdkMemoryTextures from raw pixel data.
 *
 * Architecture: Raw Pixels → GdkMemoryTexture → SpriteResource → SpriteWidget → Gtk.Picture
 *
 * Available patterns: SOLID, CHECKERBOARD, STRIPES_H, STRIPES_V, GRADIENT, BORDER
 * All patterns use direct memory texture creation for maximum performance.
 */
export class SpriteMockData {
  /**
   * Available sprite sizes for testing
   */
  static readonly SIZES = {
    SMALL: { width: 16, height: 16 },
    MEDIUM: { width: 32, height: 32 },
    LARGE: { width: 64, height: 64 },
    WIDE: { width: 48, height: 16 },
    TALL: { width: 16, height: 48 },
  } as const

  /**
   * Available test colors
   */
  static readonly COLORS = {
    RED: [255, 0, 0, 255],
    GREEN: [0, 255, 0, 255],
    BLUE: [0, 0, 255, 255],
    YELLOW: [255, 255, 0, 255],
    MAGENTA: [255, 0, 255, 255],
    CYAN: [0, 255, 255, 255],
    WHITE: [255, 255, 255, 255],
    BLACK: [0, 0, 0, 255],
    GRAY: [128, 128, 128, 255],
  } as const

  /**
   * Available test patterns
   */
  static readonly PATTERNS = {
    SOLID: 'solid',
    CHECKERBOARD: 'checkerboard',
    STRIPES_H: 'stripes_horizontal',
    STRIPES_V: 'stripes_vertical',
    GRADIENT: 'gradient',
    BORDER: 'border',
  } as const

  /**
   * Create a solid color sprite (texture-based)
   */
  static createSolidSprite(
    width: number,
    height: number,
    color: readonly [number, number, number, number] = SpriteMockData.COLORS
      .RED,
  ): SpriteResource {
    const texture = SpriteMockData.createSolidTexture(width, height, color)
    return SpriteResource.fromTexture(texture)
  }

  /**
   * Create a checkerboard pattern sprite (texture-based)
   */
  static createCheckerboardSprite(
    width: number,
    height: number,
    color1: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLACK,
    color2: readonly [number, number, number, number] = SpriteMockData.COLORS
      .WHITE,
    checkSize: number = 4,
  ): SpriteResource {
    const texture = SpriteMockData.createCheckerboardTexture(
      width,
      height,
      color1,
      color2,
      checkSize,
    )
    return SpriteResource.fromTexture(texture)
  }

  /**
   * Create a striped pattern sprite (texture-based)
   */
  static createStripedSprite(
    width: number,
    height: number,
    color1: readonly [number, number, number, number] = SpriteMockData.COLORS
      .RED,
    color2: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLUE,
    stripeSize: number = 4,
    horizontal: boolean = true,
  ): SpriteResource {
    const texture = SpriteMockData.createStripedTexture(
      width,
      height,
      color1,
      color2,
      stripeSize,
      horizontal,
    )
    return SpriteResource.fromTexture(texture)
  }

  /**
   * Create a gradient sprite (texture-based)
   */
  static createGradientSprite(
    width: number,
    height: number,
    startColor: readonly [number, number, number, number] = SpriteMockData
      .COLORS.RED,
    endColor: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLUE,
    horizontal: boolean = true,
  ): SpriteResource {
    const texture = SpriteMockData.createGradientTexture(
      width,
      height,
      startColor,
      endColor,
      horizontal,
    )
    return SpriteResource.fromTexture(texture)
  }

  /**
   * Create a sprite with a border (texture-based)
   */
  static createBorderSprite(
    width: number,
    height: number,
    fillColor: readonly [number, number, number, number] = SpriteMockData.COLORS
      .WHITE,
    borderColor: readonly [number, number, number, number] = SpriteMockData
      .COLORS.BLACK,
    borderWidth: number = 1,
  ): SpriteResource {
    const texture = SpriteMockData.createBorderTexture(
      width,
      height,
      fillColor,
      borderColor,
      borderWidth,
    )
    return SpriteResource.fromTexture(texture)
  }

  /**
   * Get size configuration by name
   */
  static getSize(sizeName: keyof typeof SpriteMockData.SIZES) {
    return SpriteMockData.SIZES[sizeName]
  }

  /**
   * Get all available size names
   */
  static getSizeNames(): string[] {
    return Object.keys(SpriteMockData.SIZES)
  }

  /**
   * Get all available color names
   */
  static getColorNames(): string[] {
    return Object.keys(SpriteMockData.COLORS)
  }

  /**
   * Get all available pattern names
   */
  static getPatternNames(): string[] {
    return Object.keys(SpriteMockData.PATTERNS)
  }

  // ===============================================
  // Modern Gdk.Texture-based creation methods
  // ===============================================

  /**
   * Create a GdkMemoryTexture directly from raw pixel data
   * 🚀 ZERO pixbuf overhead - pure modern GTK4 memory texture creation!
   *
   * @param width Image width in pixels
   * @param height Image height in pixels
   * @param pixels Raw RGBA pixel data (4 bytes per pixel)
   * @returns GdkMemoryTexture ready for display
   */
  static createTextureFromPixels(
    width: number,
    height: number,
    pixels: Uint8Array,
  ): Gdk.Texture {
    // Create GLib.Bytes from pixel data
    const bytes = GLib.Bytes.new(pixels)

    // Create memory texture directly from raw pixel data
    // Format: R8G8B8A8 = RGBA, 8 bits per channel, 4 bytes per pixel
    const rowstride = width * 4

    return Gdk.MemoryTexture.new(
      width, // Width
      height, // Height
      Gdk.MemoryFormat.R8G8B8A8, // Memory format (RGBA 8-bit)
      bytes, // Pixel data
      rowstride, // Row stride
    )
  }

  /**
   * Create a solid color texture directly
   * More efficient than the pixbuf-based approach
   */
  static createSolidTexture(
    width: number,
    height: number,
    color: readonly [number, number, number, number] = SpriteMockData.COLORS
      .RED,
  ): Gdk.Texture {
    const actualWidth = Math.max(width, 1)
    const actualHeight = Math.max(height, 1)

    // Create pixel array
    const pixels = new Uint8Array(actualWidth * actualHeight * 4)

    // Fill with solid color
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = color[0] // R
      pixels[i + 1] = color[1] // G
      pixels[i + 2] = color[2] // B
      pixels[i + 3] = color[3] // A
    }

    return SpriteMockData.createTextureFromPixels(
      actualWidth,
      actualHeight,
      pixels,
    )
  }

  /**
   * Create a checkerboard pattern texture
   */
  static createCheckerboardTexture(
    width: number,
    height: number,
    color1: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLACK,
    color2: readonly [number, number, number, number] = SpriteMockData.COLORS
      .WHITE,
    checkSize: number = 4,
  ): Gdk.Texture {
    const pixels = new Uint8Array(width * height * 4)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const checkX = Math.floor(x / checkSize)
        const checkY = Math.floor(y / checkSize)
        const isEven = (checkX + checkY) % 2 === 0
        const color = isEven ? color1 : color2

        const offset = (y * width + x) * 4
        pixels[offset] = color[0] // R
        pixels[offset + 1] = color[1] // G
        pixels[offset + 2] = color[2] // B
        pixels[offset + 3] = color[3] // A
      }
    }

    return SpriteMockData.createTextureFromPixels(width, height, pixels)
  }

  /**
   * Create a striped pattern texture
   */
  static createStripedTexture(
    width: number,
    height: number,
    color1: readonly [number, number, number, number] = SpriteMockData.COLORS
      .RED,
    color2: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLUE,
    stripeSize: number = 4,
    horizontal: boolean = true,
  ): Gdk.Texture {
    const pixels = new Uint8Array(width * height * 4)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const stripe = horizontal
          ? Math.floor(y / stripeSize)
          : Math.floor(x / stripeSize)
        const color = stripe % 2 === 0 ? color1 : color2

        const offset = (y * width + x) * 4
        pixels[offset] = color[0] // R
        pixels[offset + 1] = color[1] // G
        pixels[offset + 2] = color[2] // B
        pixels[offset + 3] = color[3] // A
      }
    }

    return SpriteMockData.createTextureFromPixels(width, height, pixels)
  }

  /**
   * Create a gradient texture
   */
  static createGradientTexture(
    width: number,
    height: number,
    startColor: readonly [number, number, number, number] = SpriteMockData
      .COLORS.RED,
    endColor: readonly [number, number, number, number] = SpriteMockData.COLORS
      .BLUE,
    horizontal: boolean = true,
  ): Gdk.Texture {
    const pixels = new Uint8Array(width * height * 4)
    const maxDimension = horizontal ? width : height

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const position = horizontal ? x : y
        const ratio = maxDimension > 1 ? position / (maxDimension - 1) : 0

        // Interpolate between start and end colors
        const r = Math.round(
          startColor[0] + (endColor[0] - startColor[0]) * ratio,
        )
        const g = Math.round(
          startColor[1] + (endColor[1] - startColor[1]) * ratio,
        )
        const b = Math.round(
          startColor[2] + (endColor[2] - startColor[2]) * ratio,
        )
        const a = Math.round(
          startColor[3] + (endColor[3] - startColor[3]) * ratio,
        )

        const offset = (y * width + x) * 4
        pixels[offset] = r
        pixels[offset + 1] = g
        pixels[offset + 2] = b
        pixels[offset + 3] = a
      }
    }

    return SpriteMockData.createTextureFromPixels(width, height, pixels)
  }

  /**
   * Create a border pattern texture
   */
  static createBorderTexture(
    width: number,
    height: number,
    fillColor: readonly [number, number, number, number] = SpriteMockData.COLORS
      .WHITE,
    borderColor: readonly [number, number, number, number] = SpriteMockData
      .COLORS.BLACK,
    borderWidth: number = 1,
  ): Gdk.Texture {
    const pixels = new Uint8Array(width * height * 4)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBorder =
          x < borderWidth ||
          x >= width - borderWidth ||
          y < borderWidth ||
          y >= height - borderWidth

        const color = isBorder ? borderColor : fillColor

        const offset = (y * width + x) * 4
        pixels[offset] = color[0] // R
        pixels[offset + 1] = color[1] // G
        pixels[offset + 2] = color[2] // B
        pixels[offset + 3] = color[3] // A
      }
    }

    return SpriteMockData.createTextureFromPixels(width, height, pixels)
  }

  /**
   * Create an optimized texture-based sprite
   * Now all patterns are texture-based, so this is the same as createSprite
   */
  static createSprite(
    width: number,
    height: number,
    pattern: keyof typeof SpriteMockData.PATTERNS = 'SOLID',
    primaryColor: keyof typeof SpriteMockData.COLORS = 'RED',
    secondaryColor: keyof typeof SpriteMockData.COLORS = 'BLUE',
  ): SpriteResource {
    // All patterns are now optimized and texture-based
    return SpriteMockData.createSprite(
      width,
      height,
      pattern,
      primaryColor,
      secondaryColor,
    )
  }

  /**
   * Utility: Get texture from SpriteResource (direct access)
   * No conversion needed in unified architecture
   */
  static spriteToTexture(sprite: SpriteResource): Gdk.Texture {
    return sprite.texture
  }
}
