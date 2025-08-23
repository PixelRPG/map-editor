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
import { SpriteSetResource } from '@pixelrpg/data-gjs'

// Import story template
import SpriteStoryTemplate from './sprite.widget.story.blp'

/**
 * SpriteWidget Story
 * Showcases the SpriteWidget component with a single sprite from Lokiri Forest
 */
export class SpriteWidgetStory extends StoryWidget {
  private spriteWidget: SpriteWidget | null = null
  private spriteSetResource: SpriteSetResource | null = null

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
        scale: 2.0,
        spriteIndex: 0,
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
        scale: {
          control: {
            type: ControlType.RANGE,
            min: 1.0,
            max: 4.0,
            step: 0.25,
          },
          description: 'Scale factor for displaying the sprite',
          defaultValue: 2.0,
        },
        spriteIndex: {
          control: {
            type: ControlType.RANGE,
            min: 0,
            max: 255,
            step: 1,
          },
          description: 'Index of the sprite to display from the sprite sheet',
          defaultValue: 0,
        },
      },
    }
  }

  /**
   * Initialize the story
   * Loads the Lokiri Forest sprite sheet and creates the widget
   */
  initialize(): void {
    this._loadSpriteSheet()
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    // Only update if we have loaded resources and widget exists
    if (!this.spriteSetResource?.spriteSheet || !this.spriteWidget) {
      return
    }

    let hasChanges = false

    // Check and update scale
    if (this.args.scale !== this.spriteWidget.scale) {
      this.spriteWidget.scale = this.args.scale
      hasChanges = true
    }

    // Check and update sprite index
    const currentSpriteIndex = this._getCurrentSpriteIndex()
    if (this.args.spriteIndex !== currentSpriteIndex) {
      this._updateSprite()
      hasChanges = true
    }

    // Only update info label if something actually changed
    if (hasChanges) {
      this._updateInfoLabel()
    }
  }

  /**
   * Load the Lokiri Forest sprite sheet data and image using SpriteSetResource
   */
  private async _loadSpriteSheet(): Promise<void> {
    try {
      this._info_label.set_label('Loading Lokiri Forest sprite sheet...')

      // 1. Create SpriteSetResource with the JSON file path
      // SpriteSetResource now handles everything internally (like Excalibur)
      this.spriteSetResource = new SpriteSetResource(
        '../../games/zelda-like/spritesets/lokiri-forest.json',
      )
      const spriteSetData = await this.spriteSetResource.load()

      // 2. Verify sprite sheet was created
      if (!this.spriteSetResource.spriteSheet) {
        throw new Error(
          'SpriteSetResource did not create sprite sheet properly',
        )
      }

      // 3. Create the widget
      this._createSpriteWidget()
      this._updateInfoLabel()
    } catch (error) {
      console.error('Failed to load sprite sheet:', error)
      this._info_label.set_label(
        `Error: Failed to load sprite sheet - ${error}`,
      )

      // Show error message in container
      const errorLabel = new Gtk.Label({
        label:
          'Failed to load the Lokiri Forest sprite sheet.\nPlease check that the assets are properly configured.',
        justify: Gtk.Justification.CENTER,
        wrap: true,
      })
      errorLabel.add_css_class('dim-label')
      this._sprite_container.append(errorLabel)
    }
  }

  /**
   * Create the sprite widget (called only once during initialization)
   */
  private _createSpriteWidget(): void {
    if (!this.spriteSetResource?.spriteSheet) {
      console.warn('Cannot create sprite widget: resources not loaded')
      return
    }

    try {
      // Get the sprite at the specified index
      const spriteIndex = Math.max(0, this.args.spriteIndex ?? 0)
      const sprites = this.spriteSetResource.spriteSheet.sprites
      const sprite = sprites[Math.min(spriteIndex, sprites.length - 1)]

      if (!sprite) {
        throw new Error('No sprite found at the specified index')
      }

      // Create the widget with initial args
      this.spriteWidget = new SpriteWidget(sprite, this.args.scale ?? 2.0)

      // Add to container
      this._sprite_container.append(this.spriteWidget)
    } catch (error) {
      console.error('Failed to create sprite widget:', error)
      this._info_label.set_label('Error: Failed to create sprite widget')
    }
  }

  /**
   * Update the displayed sprite based on current sprite index
   */
  private _updateSprite(): void {
    if (!this.spriteSetResource?.spriteSheet || !this.spriteWidget) {
      return
    }

    const spriteIndex = Math.max(0, this.args.spriteIndex ?? 0)
    const sprites = this.spriteSetResource.spriteSheet.sprites
    const sprite = sprites[Math.min(spriteIndex, sprites.length - 1)]

    if (sprite) {
      this.spriteWidget.sprite = sprite
    }
  }

  /**
   * Get the current sprite index
   */
  private _getCurrentSpriteIndex(): number {
    if (!this.spriteSetResource?.spriteSheet || !this.spriteWidget?.sprite) {
      return 0
    }

    const sprites = this.spriteSetResource.spriteSheet.sprites
    return sprites.indexOf(this.spriteWidget.sprite)
  }

  /**
   * Update the info label with current sprite information
   */
  private _updateInfoLabel(): void {
    if (!this.spriteSetResource?.spriteSheet || !this.spriteWidget?.sprite) {
      this._info_label.set_label('No sprite loaded')
      return
    }

    const data = this.spriteSetResource.data
    const sprite = this.spriteWidget.sprite
    const spriteIndex = this._getCurrentSpriteIndex()
    const scale = this.args.scale ?? 2.0

    const info = [
      `Lokiri Forest Sprite #${spriteIndex}`,
      `${sprite.width}×${sprite.height}px`,
      `Position: (${sprite.x}, ${sprite.y})`,
      `Scale: ${scale}x`,
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
