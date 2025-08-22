import GObject from '@girs/gobject-2.0'
import GLib from '@girs/glib-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { SpriteWidget } from './sprite.widget'
import { Sprite } from '@pixelrpg/data-gjs'

// Import story template
import SpriteStoryTemplate from './sprite.widget.story.blp'

/**
 * Red color constant
 */
const RED_COLOR = [255, 0, 0, 255] as const

/**
 * Create a GdkMemoryTexture directly from raw pixel data
 */
function createTextureFromPixels(
  width: number,
  height: number,
  pixels: Uint8Array,
): Gdk.Texture {
  const bytes = GLib.Bytes.new(pixels)
  const rowstride = width * 4

  return Gdk.MemoryTexture.new(
    width,
    height,
    Gdk.MemoryFormat.R8G8B8A8,
    bytes,
    rowstride,
  )
}

/**
 * Create a simple red sprite
 */
function createRedSprite(width: number, height: number): Sprite {
  console.log(`Creating red sprite ${width}x${height}`)

  const actualWidth = Math.max(width, 1)
  const actualHeight = Math.max(height, 1)
  const pixels = new Uint8Array(actualWidth * actualHeight * 4)

  // Fill with red color
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = RED_COLOR[0] // R
    pixels[i + 1] = RED_COLOR[1] // G
    pixels[i + 2] = RED_COLOR[2] // B
    pixels[i + 3] = RED_COLOR[3] // A
  }

  const texture = createTextureFromPixels(actualWidth, actualHeight, pixels)
  console.log('Texture created:', texture)
  const sprite = Sprite.fromTexture(texture)
  console.log('Sprite created:', sprite)

  return sprite
}

/**
 * SpriteWidget Story
 * Showcases the SpriteWidget component with interactive controls
 */
export class SpriteWidgetStory extends StoryWidget {
  private spriteWidget: SpriteWidget | null = null

  // UI elements from template
  declare _info_label: Gtk.Label
  declare _sprite_container: Gtk.Box

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteWidgetStory',
        Template: SpriteStoryTemplate,
        InternalChildren: ['info_label', 'sprite_container'],
      },
      this,
    )
  }

  constructor() {
    super({
      story: 'SpriteWidget',
      args: {
        width: 32,
        height: 32,
      },
      meta: SpriteWidgetStory.getMetadata(),
    })
  }

  /**
   * Get the metadata for the SpriteWidget story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'UI/Sprite Widget',
      component: SpriteWidget.$gtype,
      tags: ['autodocs', 'ui', 'graphics'],
      argTypes: {
        width: {
          control: {
            type: ControlType.RANGE,
            min: 8,
            max: 128,
            step: 8,
          },
          description: 'Width of the sprite in pixels',
          defaultValue: 32,
        },
        height: {
          control: {
            type: ControlType.RANGE,
            min: 8,
            max: 128,
            step: 8,
          },
          description: 'Height of the sprite in pixels',
          defaultValue: 32,
        },
      },
    }
  }

  /**
   * Initialize the story
   * Creates the sprite widget instance and sets up the display
   */
  initialize(): void {
    this._createSpriteWidget()
    this._updateInfoLabel()
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    this._createSpriteWidget()
    this._updateInfoLabel()
  }

  /**
   * Create or recreate the sprite widget with current args
   */
  private _createSpriteWidget(): void {
    // Remove existing widget if present
    if (this.spriteWidget) {
      this._sprite_container.remove(this.spriteWidget)
      this.spriteWidget = null
    }

    // Get current args with defaults
    const width = this.args.width ?? 32
    const height = this.args.height ?? 32

    try {
      // Create simple red sprite
      const sprite = createRedSprite(width, height)

      // Create the sprite widget
      this.spriteWidget = new SpriteWidget(sprite)

      // Add to container
      this._sprite_container.append(this.spriteWidget)
    } catch (error) {
      console.error('Failed to create sprite widget:', error)
      this._info_label.set_label('Error: Failed to create sprite')
    }
  }

  /**
   * Update the info label with current sprite information
   */
  private _updateInfoLabel(): void {
    if (!this.spriteWidget) {
      this._info_label.set_label('No sprite loaded')
      return
    }

    const width = this.args.width ?? 32
    const height = this.args.height ?? 32

    const info = `Red sprite: ${width}×${height}px`
    this._info_label.set_label(info)
  }
}

// Ensure the type is registered
GObject.type_ensure(SpriteWidgetStory.$gtype)

/**
 * Collection of all sprite widget story variants
 */
export const SpriteWidgetStories: StoryModule = {
  stories: [SpriteWidgetStory],
}
