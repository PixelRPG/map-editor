import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import { StoryWidget, StoryMeta, StoryModule } from '@pixelrpg/story-gjs'
import { MapEditorPanel } from './map-editor-panel'
import {
  SpriteSetResource,
  SpriteSheet,
  GameProjectResource,
} from '@pixelrpg/data-gjs'
import { MapData } from '@pixelrpg/data-core'

// Import story template
import MapEditorPanelStoryTemplate from './map-editor-panel.story.blp'

/**
 * MapEditorPanel Story
 * Showcases the MapEditorPanel component with tileset and layer selection
 */
export class MapEditorPanelStory extends StoryWidget {
  private gameProjectResource: GameProjectResource | null = null
  private currentMapData: MapData | null = null
  private loadedSpriteSheets: SpriteSheet[] = []

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
      args: {},
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
      controls: [],
    }
  }

  /**
   * Initialize the story
   * Loads the sample project and map data
   */
  initialize(): void {
    this._loadProjectAndMap()
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    // No dynamic controls to update
  }

  /**
   * Load sample project and map data for the map editor panel
   */
  private async _loadProjectAndMap(): Promise<void> {
    try {
      this._info_label.set_label('Loading sample project and map data...')

      // Load the game project
      this.gameProjectResource = new GameProjectResource(
        '../../games/zelda-like/game-project.json',
        {
          preloadResources: true,
          useGResource: false,
        },
      )

      await this.gameProjectResource.load()

      // Load the sample map (kokiri-forest)
      const mapId = 'kokiri-forest'
      this.currentMapData = await this.gameProjectResource.getMap(mapId)

      if (!this.currentMapData) {
        throw new Error(`Map '${mapId}' not found in project`)
      }

      // Load sprite sheets for the map
      if (this.currentMapData.spriteSets) {
        for (const spriteSetRef of this.currentMapData.spriteSets) {
          const spriteSetResource = await this.gameProjectResource.getSpriteSet(
            spriteSetRef.id,
          )
          if (spriteSetResource && spriteSetResource.spriteSheet) {
            this.loadedSpriteSheets.push(spriteSetResource.spriteSheet)
          } else {
            console.warn('SpriteSet or SpriteSheet not found:', spriteSetRef.id)
          }
        }
      }

      // Initialize the panel with loaded data
      this._initializePanel()
      this._updateInfoLabel()
    } catch (error) {
      console.error('Failed to load project and map:', error)
      this._info_label.set_label(
        `Error: Failed to load project and map - ${error}`,
      )

      // Show error in panel
      this._createErrorPlaceholder()
    }
  }

  /**
   * Initialize the panel with loaded map data and sprite sheets
   */
  private _initializePanel(): void {
    try {
      if (!this.currentMapData) {
        throw new Error('No map data available')
      }

      // Use the new initializeMapData method
      this._mapEditorPanel.initializeMapData(
        this.currentMapData,
        this.loadedSpriteSheets,
      )
    } catch (error) {
      console.error('Failed to initialize MapEditorPanel:', error)
      this._info_label.set_label(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Create error placeholder when assets can't be loaded
   */
  private _createErrorPlaceholder(): void {
    // Reset the panel state - no specific clear method needed since
    // initializeMapData will handle the complete state
    console.warn('MapEditorPanel in error state')
  }

  /**
   * Update the info label with current panel information
   */
  private _updateInfoLabel(): void {
    if (!this.currentMapData || this.loadedSpriteSheets.length === 0) {
      this._info_label.set_label('No map data or sprite sheets loaded')
      return
    }

    const spriteSheetCount = this.loadedSpriteSheets.length
    const totalSprites = this.loadedSpriteSheets.reduce(
      (sum, spriteSheet) => sum + spriteSheet.sprites.length,
      0,
    )
    const layerCount = this.currentMapData.layers.length

    const info = [
      `Map: ${this.currentMapData.name || this.currentMapData.id}`,
      `${spriteSheetCount} sprite sheet${spriteSheetCount !== 1 ? 's' : ''}`,
      `${totalSprites} sprites`,
      `${layerCount} layer${layerCount !== 1 ? 's' : ''}`,
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
