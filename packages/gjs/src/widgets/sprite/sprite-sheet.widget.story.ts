import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { SpriteSheetWidget } from './sprite-sheet.widget'
import { SpriteSetResource } from '../../sprite'

// Import story template
import SpriteSheetStoryTemplate from './sprite-sheet.widget.story.blp'

/**
 * SpriteSheetWidget Story
 * Showcases the SpriteSheetWidget component with the Lokiri Forest sprite sheet
 */
export class SpriteSheetWidgetStory extends StoryWidget {
  private spriteSheetWidget: SpriteSheetWidget | null = null
  private spriteSetResource: SpriteSetResource | null = null

  // UI elements from template
  declare _info_label: Gtk.Label
  declare _sprite_sheet_container: Gtk.Box

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteSheetWidgetStory',
        Template: SpriteSheetStoryTemplate,
        InternalChildren: ['info_label', 'sprite_sheet_container'],
      },
      this,
    )
  }

  constructor() {
    super({
      story: 'SpriteSheetWidget',
      args: {
        scale: 1.0,
        showGrid: true,
        maxColumns: 16,
      },
      meta: SpriteSheetWidgetStory.getMetadata(),
    })
  }

  /**
   * Get the metadata for the SpriteSheetWidget story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'UI/Sprite Sheet Widget',
      description:
        'Display and interact with complete sprite sheets with grid layout and scaling options',
      component: SpriteSheetWidget.$gtype,
      tags: ['autodocs', 'ui', 'graphics', 'sprite-sheet'],
      controls: [
        {
          name: 'scale',
          label: 'Scale',
          type: ControlType.RANGE,
          min: 1,
          max: 4.0,
          step: 0.25,
          defaultValue: 1.0,
          description: 'Scale factor for displaying sprites',
        },
        {
          name: 'showGrid',
          label: 'Show Grid',
          type: ControlType.BOOLEAN,
          defaultValue: true,
          description: 'Show grid lines between sprites',
        },
        {
          name: 'maxColumns',
          label: 'Max Columns',
          type: ControlType.RANGE,
          min: 4,
          max: 64,
          step: 1,
          defaultValue: 16,
          description:
            'Maximum number of columns to display (for large sprite sheets)',
        },
      ],
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
    if (!this.spriteSetResource?.spriteSheet || !this.spriteSheetWidget) {
      return
    }

    let hasChanges = false

    // Check and update scale
    if (this.args.scale !== this.spriteSheetWidget.scale) {
      this.spriteSheetWidget.updateScale(this.args.scale)
      hasChanges = true
    }

    // Check and update showGrid
    if (this.args.showGrid !== this.spriteSheetWidget.showGrid) {
      this.spriteSheetWidget.updateShowGrid(this.args.showGrid)
      hasChanges = true
    }

    // Check and update maxColumns
    if (this.args.maxColumns !== this.spriteSheetWidget.maxColumns) {
      this.spriteSheetWidget.updateMaxColumns(this.args.maxColumns)
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

      // 4. Create the widget
      this._createSpriteSheetWidget()
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
      this._sprite_sheet_container.append(errorLabel)
    }
  }

  /**
   * Create the sprite sheet widget (called only once during initialization)
   */
  private _createSpriteSheetWidget(): void {
    if (!this.spriteSetResource?.spriteSheet) {
      console.warn('Cannot create sprite sheet widget: resources not loaded')
      return
    }

    try {
      // Create the widget with initial args
      this.spriteSheetWidget = new SpriteSheetWidget(
        this.spriteSetResource.spriteSheet,
        {
          scale: this.args.scale ?? 1.0,
          showGrid: this.args.showGrid ?? true,
          maxColumns: this.args.maxColumns ?? 16,
        },
      )

      // Add to container
      this._sprite_sheet_container.append(this.spriteSheetWidget)
    } catch (error) {
      console.error('Failed to create sprite sheet widget:', error)
      this._info_label.set_label('Error: Failed to create sprite sheet widget')
    }
  }

  /**
   * Update the info label with current sprite sheet information
   */
  private _updateInfoLabel(): void {
    if (!this.spriteSetResource?.spriteSheet) {
      this._info_label.set_label('No sprite sheet loaded')
      return
    }

    const data = this.spriteSetResource.data
    const spriteCount = this.spriteSetResource.spriteSheet.sprites.length
    const namedSprites = Object.keys(this.spriteSetResource.sprites).length
    const scale = this.args.scale ?? 1.0

    const info = [
      `Lokiri Forest Tileset`,
      `${data.columns}×${data.rows} grid`,
      `${spriteCount} grid sprites`,
      `${namedSprites} named sprites`,
      `${data.spriteWidth}×${data.spriteHeight}px each`,
      `Scale: ${scale}x`,
    ].join(' • ')

    this._info_label.set_label(info)
  }
}

// Ensure the type is registered
GObject.type_ensure(SpriteSheetWidgetStory.$gtype)

/**
 * Collection of all sprite sheet widget story variants
 */
export const SpriteSheetWidgetStories: StoryModule = {
  stories: [SpriteSheetWidgetStory],
}
