import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { MapEditorPanel } from './map-editor-panel'
import { SpriteSheetWidget } from '../sprite/sprite-sheet.widget'
import { SpriteSetResource, SpriteSheet } from '@pixelrpg/data-gjs'

// Import story template
import MapEditorPanelStoryTemplate from './map-editor-panel.story.blp'

/**
 * MapEditorPanel Story
 * Showcases the MapEditorPanel component with tileset and layer selection
 */
export class MapEditorPanelStory extends StoryWidget {
  private spriteSheetWidget: SpriteSheetWidget | null = null
  private spriteSetResources: SpriteSetResource[] = []
  private loadedTilesets: { spriteSheet: SpriteSheet; name: string }[] = []

  // UI elements from template
  declare _info_label: Gtk.Label
  declare _mapEditorPanel: MapEditorPanel

  static {
    GObject.registerClass(
      {
        GTypeName: 'MapEditorPanelStory',
        Template: MapEditorPanelStoryTemplate,
        InternalChildren: ['info_label', 'mapEditorPanel'],
      },
      this,
    )
  }

  constructor() {
    super({
      story: 'MapEditorPanel',
      args: {
        defaultPage: 'pageTilesets',
        tilesetCount: 2,
      },
      meta: MapEditorPanelStory.getMetadata(),
    })
  }

  /**
   * Get the metadata for the MapEditorPanel story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'Map Editor/Map Editor Panel',
      description:
        'Interactive panel for map editing with multiple tilesets and layer selection',
      component: MapEditorPanel.$gtype,
      tags: ['autodocs', 'ui', 'map-editor', 'panel'],
      controls: [
        {
          name: 'defaultPage',
          label: 'Default Page',
          type: ControlType.SELECT,
          defaultValue: 'pageTilesets',
          options: [
            { label: 'Tilesets', value: 'pageTilesets' },
            { label: 'Layer', value: 'pageLayer' },
          ],
          description: 'Select which page to show by default',
        },
        {
          name: 'tilesetCount',
          label: 'Tileset Count',
          type: ControlType.RANGE,
          min: 0,
          max: 3,
          step: 1,
          defaultValue: 2,
          description: 'Number of tilesets to display in the panel',
        },
      ],
    }
  }

  /**
   * Initialize the story
   * Loads multiple sample tilesets and creates the panel
   */
  initialize(): void {
    this._loadTilesets()
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    // Only update if we have loaded tilesets
    if (this.loadedTilesets.length === 0) {
      return
    }

    let hasChanges = false

    // Check and update tileset count
    if (this.args.tilesetCount !== this.loadedTilesets.length) {
      this._updateTilesetCount(this.args.tilesetCount)
      hasChanges = true
    }

    // Check and update default page
    if (this.args.defaultPage) {
      this._updateDefaultPage(this.args.defaultPage as string)
      hasChanges = true
    }

    // Only update info label if something actually changed
    if (hasChanges) {
      this._updateInfoLabel()
    }
  }

  /**
   * Load sample tilesets for the map editor panel
   */
  private async _loadTilesets(): Promise<void> {
    try {
      this._info_label.set_label('Loading sample tilesets for map editor...')

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
      }

      // Initialize the panel with loaded tilesets
      this._initializePanel()
      this._updateInfoLabel()
    } catch (error) {
      console.error('Failed to load tilesets:', error)
      this._info_label.set_label(`Error: Failed to load tilesets - ${error}`)

      // Show error in panel
      this._createErrorPlaceholder()
    }
  }

  /**
   * Initialize the panel with loaded tilesets
   */
  private _initializePanel(): void {
    try {
      // Set initial tilesets based on tilesetCount
      this._updateTilesetCount(this.args.tilesetCount ?? 2)

      // Set default page
      this._updateDefaultPage(this.args.defaultPage as string)

      // Create a placeholder layers widget
      this._createLayerSelector()
    } catch (error) {
      console.error('Failed to initialize MapEditorPanel:', error)
      this._info_label.set_label(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Create a placeholder layers widget
   */
  private _createLayerSelector(): void {
    // TODO: Implement layer selector
    // this._mapEditorPanel?.setLayers()
  }

  /**
   * Create error placeholder when assets can't be loaded
   */
  private _createErrorPlaceholder(): void {
    // Clear any existing tilesets
    this._mapEditorPanel.clearTilesets()
  }

  /**
   * Update the number of displayed tilesets
   */
  private _updateTilesetCount(count: number): void {
    const targetCount = Math.min(count, this.loadedTilesets.length)

    // Clear existing tilesets
    this._mapEditorPanel.clearTilesets()

    // Add tilesets up to the target count
    for (let i = 0; i < targetCount; i++) {
      const tileset = this.loadedTilesets[i]
      this._mapEditorPanel.addTileset(tileset.spriteSheet, tileset.name)
    }
  }

  /**
   * Update the default page
   */
  private _updateDefaultPage(defaultPage: string): void {
    if (defaultPage) {
      this._mapEditorPanel.stack.set_visible_child_name(defaultPage)
    }
  }

  /**
   * Update the info label with current panel information
   */
  private _updateInfoLabel(): void {
    if (this.loadedTilesets.length === 0) {
      this._info_label.set_label('No tilesets loaded')
      return
    }

    const displayedCount = Math.min(
      this.args.tilesetCount ?? 2,
      this.loadedTilesets.length,
    )
    const totalSprites = this.loadedTilesets
      .slice(0, displayedCount)
      .reduce((sum, tileset) => sum + tileset.spriteSheet.sprites.length, 0)

    const info = [
      `Map Editor Panel`,
      `${displayedCount} tileset${displayedCount !== 1 ? 's' : ''} loaded`,
      `${totalSprites} total sprites available`,
      `Page: ${this.args.defaultPage === 'pageTilesets' ? 'Tilesets' : 'Layers'}`,
    ].join(' • ')

    this._info_label.set_label(info)
  }
}

// Ensure the type is registered
GObject.type_ensure(MapEditorPanelStory.$gtype)

/**
 * Collection of all MapEditorPanel story variants
 */
export const MapEditorPanelStories: StoryModule = {
  stories: [MapEditorPanelStory],
}
