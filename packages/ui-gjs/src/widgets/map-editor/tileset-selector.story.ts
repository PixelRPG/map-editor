import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { TilesetSelector } from './tileset-selector'
import { SpriteSetResource, SpriteSheet } from '@pixelrpg/data-gjs'

// Import story template
import TilesetSelectorStoryTemplate from './tileset-selector.story.blp'

/**
 * TilesetSelector Story
 * Showcases the TilesetSelector component with multiple sample tilesets
 */
export class TilesetSelectorStory extends StoryWidget {
  private tilesetSelector: TilesetSelector | null = null
  private spriteSetResources: SpriteSetResource[] = []
  private loadedTilesets: { spriteSheet: SpriteSheet; name: string }[] = []

  // UI elements from template
  declare _info_label: Gtk.Label
  declare _tileset_selector_container: Gtk.Box

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesetSelectorStory',
        Template: TilesetSelectorStoryTemplate,
        InternalChildren: ['info_label', 'tileset_selector_container'],
      },
      this,
    )
  }

  constructor() {
    super({
      story: 'TilesetSelector',
      args: {
        spriteScale: 1.0,
        showGrid: true,
        spacing: 12,
        tilesetCount: 2,
      },
      meta: TilesetSelectorStory.getMetadata(),
    })
  }

  /**
   * Get the metadata for the TilesetSelector story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'Map Editor/Tileset Selector',
      description:
        'Container for displaying multiple tilesets vertically with individual sprite sheet widgets',
      component: TilesetSelector.$gtype,
      tags: ['autodocs', 'ui', 'map-editor', 'tileset', 'container'],
      controls: [
        {
          name: 'spriteScale',
          label: 'Sprite Scale',
          type: ControlType.RANGE,
          min: 0.5,
          max: 3.0,
          step: 0.25,
          defaultValue: 1.0,
          description: 'Scale factor for displaying sprites in all tilesets',
        },
        {
          name: 'showGrid',
          label: 'Show Grid',
          type: ControlType.BOOLEAN,
          defaultValue: true,
          description: 'Show grid lines between sprites in all tilesets',
        },
        {
          name: 'spacing',
          label: 'Section Spacing',
          type: ControlType.RANGE,
          min: 0,
          max: 48,
          step: 4,
          defaultValue: 12,
          description: 'Spacing between tileset sections',
        },
        {
          name: 'tilesetCount',
          label: 'Tileset Count',
          type: ControlType.RANGE,
          min: 0,
          max: 3,
          step: 1,
          defaultValue: 2,
          description:
            'Number of tilesets to display (simulates different scenarios)',
        },
      ],
    }
  }

  /**
   * Initialize the story
   * Loads multiple sample tilesets and creates the widget
   */
  initialize(): void {
    this._loadTilesets()
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    // Only update if we have loaded the widget
    if (!this.tilesetSelector) {
      return
    }

    let hasChanges = false

    // Check and update sprite scale
    if (this.args.spriteScale !== this.tilesetSelector.spriteScale) {
      this.tilesetSelector.spriteScale = this.args.spriteScale
      hasChanges = true
    }

    // Check and update showGrid
    if (this.args.showGrid !== this.tilesetSelector.showGrid) {
      this.tilesetSelector.showGrid = this.args.showGrid
      hasChanges = true
    }

    // Check and update spacing
    if (this.args.spacing !== this.tilesetSelector.spacing) {
      this.tilesetSelector.spacing = this.args.spacing
      hasChanges = true
    }

    // Check and update tileset count
    if (this.args.tilesetCount !== this.loadedTilesets.length) {
      this._updateTilesetCount(this.args.tilesetCount)
      hasChanges = true
    }

    // Only update info label if something actually changed
    if (hasChanges) {
      this._updateInfoLabel()
    }
  }

  /**
   * Load sample tilesets and create the widget
   */
  private async _loadTilesets(): Promise<void> {
    try {
      this._info_label.set_label('Loading sample tilesets...')

      // Load the main Lokiri Forest sprite set
      const lokiriResource = new SpriteSetResource(
        '../../games/zelda-like/spritesets/lokiri-forest.json',
      )
      await lokiriResource.load()

      if (lokiriResource.spriteSheet) {
        this.spriteSetResources.push(lokiriResource)
        this.loadedTilesets.push({
          spriteSheet: lokiriResource.spriteSheet,
          name: lokiriResource.data.name,
        })
      }

      // Try to load water tileset if available
      try {
        const waterResource = new SpriteSetResource(
          '../../games/zelda-like/spritesets/water.json',
        )
        await waterResource.load()

        if (waterResource.spriteSheet) {
          this.spriteSetResources.push(waterResource)
          this.loadedTilesets.push({
            spriteSheet: waterResource.spriteSheet,
            name: waterResource.data.name,
          })
        }
      } catch (error) {
        console.warn('Water tileset not available:', error)
        // Create a mock tileset for demonstration
        this._createMockTileset()
      }

      // Create the widget
      this._createTilesetSelector()
      this._updateInfoLabel()
    } catch (error) {
      console.error('Failed to load tilesets:', error)
      this._info_label.set_label(`Error: Failed to load tilesets - ${error}`)

      // Show error message in container
      const errorLabel = new Gtk.Label({
        label:
          'Failed to load sample tilesets.\nPlease check that the assets are properly configured.',
        justify: Gtk.Justification.CENTER,
        wrap: true,
      })
      errorLabel.add_css_class('dim-label')
      this._tileset_selector_container.append(errorLabel)
    }
  }

  /**
   * Create a mock tileset for demonstration when assets aren't available
   */
  private _createMockTileset(): void {
    // For now, just add a note that mock tileset creation is not implemented
    // In a real scenario, you would create proper mock sprites with actual textures
    console.warn(
      'Mock tileset creation not implemented - requires actual texture data',
    )

    // Note: Creating a proper SpriteSheet requires a texture and proper sprite creation
    // This would need to be implemented with actual mock texture data if needed
  }

  /**
   * Create the tileset selector widget
   */
  private _createTilesetSelector(): void {
    if (this.loadedTilesets.length === 0) {
      console.warn('Cannot create tileset selector: no tilesets loaded')
      return
    }

    try {
      // Create the widget with initial args
      this.tilesetSelector = new TilesetSelector()

      // Set properties after creation
      this.tilesetSelector.spriteScale = this.args.spriteScale ?? 1.0
      this.tilesetSelector.showGrid = this.args.showGrid ?? true
      this.tilesetSelector.spacing = this.args.spacing ?? 12

      // Set initial tilesets based on tilesetCount
      this._updateTilesetCount(this.args.tilesetCount ?? 2)

      // Connect sprite selection signal
      this.tilesetSelector.connect(
        'sprite-selected',
        (widget, sprite, tilesetIndex) => {
          console.log(
            `Selected sprite from tileset ${tilesetIndex}:`,
            `Sprite at (${sprite.x}, ${sprite.y}) - ${sprite.width}x${sprite.height}`,
          )
        },
      )

      // Add to container
      this._tileset_selector_container.append(this.tilesetSelector)
    } catch (error) {
      console.error('Failed to create tileset selector widget:', error)
      this._info_label.set_label(
        'Error: Failed to create tileset selector widget',
      )
    }
  }

  /**
   * Update the number of displayed tilesets
   */
  private _updateTilesetCount(count: number): void {
    if (!this.tilesetSelector) return

    const targetCount = Math.min(count, this.loadedTilesets.length)

    // Clear existing tilesets
    this.tilesetSelector.clearTilesets()

    // Add tilesets up to the target count
    for (let i = 0; i < targetCount; i++) {
      const tileset = this.loadedTilesets[i]
      this.tilesetSelector.addTileset(tileset.spriteSheet, tileset.name)
    }
  }

  /**
   * Update the info label with current tileset information
   */
  private _updateInfoLabel(): void {
    if (!this.tilesetSelector || this.loadedTilesets.length === 0) {
      this._info_label.set_label('No tilesets loaded')
      return
    }

    const displayedCount = this.tilesetSelector.tilesets.length
    const totalSprites = this.tilesetSelector.tilesets.reduce(
      (sum, tileset) => sum + tileset.sprites.length,
      0,
    )
    const scale = this.args.spriteScale ?? 1.0
    const spacing = this.args.spacing ?? 12

    const info = [
      `${displayedCount} tileset${displayedCount !== 1 ? 's' : ''} displayed`,
      `${totalSprites} total sprites`,
      `Scale: ${scale}x`,
      `Spacing: ${spacing}px`,
    ].join(' • ')

    this._info_label.set_label(info)
  }
}

// Ensure the type is registered
GObject.type_ensure(TilesetSelectorStory.$gtype)

/**
 * Collection of all tileset selector story variants
 */
export const TilesetSelectorStories: StoryModule = {
  stories: [TilesetSelectorStory],
}
