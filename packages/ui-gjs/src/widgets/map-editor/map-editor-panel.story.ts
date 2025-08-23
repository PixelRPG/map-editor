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
import { SpriteSetResource } from '@pixelrpg/data-gjs'

// Import story template
import MapEditorPanelStoryTemplate from './map-editor-panel.story.blp'

/**
 * MapEditorPanel Story
 * Showcases the MapEditorPanel component with tileset and layer selection
 */
export class MapEditorPanelStory extends StoryWidget {
  private spriteSheetWidget: SpriteSheetWidget | null = null
  private spriteSetResource: SpriteSetResource | null = null

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
      },
      meta: MapEditorPanelStory.getMetadata(),
    })
  }

  /**
   * Get the metadata for the MapEditorPanel story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'MapEditorPanel',
      description:
        'Interactive panel for map editing with tileset and layer selection',
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
      ],
    }
  }

  /**
   * Called when the story is initialized or args change
   */
  async onArgsChanged(): Promise<void> {
    if (!this.spriteSheetWidget) {
      await this._initializePanel()
    }

    this._updatePanel()
  }

  /**
   * Initialize the map editor panel (called only once)
   */
  private async _initializePanel(): Promise<void> {
    try {
      // Load sprite sheet for tileset demonstration
      await this._loadSpriteSheet()

      // Create a placeholder layers widget
      this._createLayerSelector()

      this._info_label.set_label(
        'MapEditorPanel initialized with sample tileset and layers',
      )
    } catch (error) {
      console.error('Failed to initialize MapEditorPanel:', error)
      this._info_label.set_label(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Load sprite sheet for demonstration
   */
  private async _loadSpriteSheet(): Promise<void> {
    try {
      // Load the Lokiri Forest sprite set for demonstration
      this.spriteSetResource = new SpriteSetResource('kokiri-forest')
      await this.spriteSetResource.load()

      if (this.spriteSetResource?.spriteSheet) {
        // Create sprite sheet widget
        this.spriteSheetWidget = new SpriteSheetWidget(
          this.spriteSetResource.spriteSheet,
          {
            scale: 1.0,
            showGrid: true,
            maxColumns: 16,
          },
        )

        // Set it in the map editor panel
        this._mapEditorPanel.setSpriteSheet(this.spriteSheetWidget)
      }
    } catch (error) {
      console.warn('Failed to load sprite sheet:', error)
      // Create a placeholder label for the tileset selector
      const placeholderLabel = new Gtk.Label({
        label: 'No tileset loaded\n(Sample sprite sheet not available)',
        justify: Gtk.Justification.CENTER,
        valign: Gtk.Align.CENTER,
        vexpand: true,
      })
      placeholderLabel.add_css_class('dim-label')

      // Create a simple container widget that can be set as child
      const placeholderWidget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        vexpand: true,
      })
      placeholderWidget.append(placeholderLabel)

      this._mapEditorPanel.setSpriteSheet(placeholderWidget as any)
    }
  }

  /**
   * Create a placeholder layers widget
   */
  private _createLayerSelector(): void {
    // TODO: Implement layer selector
    // this.mapEditorPanel?.setLayers()
  }

  /**
   * Update panel based on current args
   */
  private _updatePanel(): void {
    // Switch to the default page
    const defaultPage = this.args.defaultPage as string
    if (defaultPage) {
      this._mapEditorPanel.stack.set_visible_child_name(defaultPage)
    }
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
