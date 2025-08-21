import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { SpriteWidget } from './sprite.widget'
import { SpriteMockData } from './mock-data'

// Import story template
import SpriteStoryTemplate from './sprite.widget.story.blp'

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
        pattern: 'SOLID',
        primaryColor: 'RED',
        secondaryColor: 'BLUE',
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
        pattern: {
          control: {
            type: ControlType.SELECT,
            options: SpriteMockData.getPatternNames(),
          },
          description: 'Pattern to generate for the test sprite',
          defaultValue: 'SOLID',
        },
        primaryColor: {
          control: {
            type: ControlType.SELECT,
            options: SpriteMockData.getColorNames(),
          },
          description: 'Primary color for the sprite pattern',
          defaultValue: 'RED',
        },
        secondaryColor: {
          control: {
            type: ControlType.SELECT,
            options: SpriteMockData.getColorNames(),
          },
          description: 'Secondary color for patterns that use two colors',
          defaultValue: 'BLUE',
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
    const pattern = this.args.pattern ?? 'SOLID'
    const primaryColor = this.args.primaryColor ?? 'RED'
    const secondaryColor = this.args.secondaryColor ?? 'BLUE'

    try {
      // Create mock sprite data using optimized method
      const spriteResource = SpriteMockData.createSprite(
        width,
        height,
        pattern as keyof typeof SpriteMockData.PATTERNS,
        primaryColor as keyof typeof SpriteMockData.COLORS,
        secondaryColor as keyof typeof SpriteMockData.COLORS,
      )

      // Create the sprite widget (now uses Gdk.Texture internally)
      this.spriteWidget = new SpriteWidget(spriteResource)

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
    const pattern = this.args.pattern ?? 'SOLID'
    const primaryColor = this.args.primaryColor ?? 'RED'

    const info = [
      `Size: ${width}×${height}px`,
      `Pattern: ${pattern}`,
      `Color: ${primaryColor}`,
    ].join(' • ')

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
