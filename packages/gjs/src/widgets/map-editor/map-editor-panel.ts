import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { MapData } from '@pixelrpg/engine'
import type { GdkSpriteSheet } from '../../sprite'
import { SignalScope } from '../../utils/signal-scope'
import type { LayerSelector } from './layer-selector'
import Template from './map-editor-panel.blp'
import type { TilesetSelector } from './tileset-selector'

export class MapEditorPanel extends Adw.Bin {
  // GObject internal children
  declare _tilesetSelector: TilesetSelector
  declare _layerSelector: LayerSelector
  declare _stack: Adw.ViewStack
  declare _viewSwitcherBar: Adw.ViewSwitcherBar
  declare _brushButton: Gtk.ToggleButton
  declare _eraserButton: Gtk.ToggleButton

  // Store map data for tile ID calculations
  private _mapData: MapData | null = null

  // Signal management
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'MapEditorPanel',
        Template,
        InternalChildren: [
          'tilesetSelector',
          'layerSelector',
          'stack',
          'viewSwitcherBar',
          'brushButton',
          'eraserButton',
        ],
        Signals: {
          'tile-selected': {
            param_types: [GObject.TYPE_INT], // tileId
          },
          'tool-changed': {
            param_types: [GObject.TYPE_STRING], // tool ('brush' | 'eraser')
          },
          'layer-selected': {
            param_types: [GObject.TYPE_STRING], // layerId
          },
        },
      },
      MapEditorPanel,
    )
  }

  /**
   * Initialize the map editor panel with map data including tilesets and layers
   * @param mapData The map data containing layers and sprite set references
   * @param spriteSheets Array of loaded sprite sheets
   */
  initializeMapData(mapData: MapData, spriteSheets: GdkSpriteSheet[]): void {
    console.log('[MapEditorPanel] Initializing with map:', mapData.name || mapData.id)
    console.log('[MapEditorPanel] Available sprite sheets:', spriteSheets.length)
    console.log('[MapEditorPanel] Map layers:', mapData.layers.length)

    // Store the map data for tile ID calculations
    this._mapData = mapData

    // Set the tilesets (sprite sheets)
    this.setTilesets(spriteSheets)

    // Set the map data in the layer selector
    this._layerSelector.setMapData(mapData)
  }

  /**
   * Handle sprite selection from tileset selector
   * Convert sprite selection to global tile ID and emit tile-selected signal
   */
  private _onSpriteSelected(_sender: any, sprite: any, tilesetIndex: number): void {
    // Validate input parameters
    if (!sprite || typeof sprite.index !== 'number') {
      console.warn('[MapEditorPanel] Invalid sprite object received')
      return
    }

    if (!this._mapData) {
      console.warn('[MapEditorPanel] No map data available')
      return
    }

    if (!this._mapData.spriteSets || !Array.isArray(this._mapData.spriteSets)) {
      console.warn('[MapEditorPanel] Invalid sprite sets data')
      return
    }

    if (tilesetIndex < 0 || tilesetIndex >= this._mapData.spriteSets.length) {
      console.warn(`[MapEditorPanel] Tileset index ${tilesetIndex} out of bounds`)
      return
    }

    // Get the sprite set reference for this tileset index
    const spriteSetRef = this._mapData.spriteSets[tilesetIndex]
    if (!spriteSetRef) {
      console.warn(`[MapEditorPanel] Sprite set reference not found for tileset index: ${tilesetIndex}`)
      return
    }

    // Validate firstGid
    if (typeof spriteSetRef.firstGid !== 'number' || spriteSetRef.firstGid < 0) {
      console.warn(`[MapEditorPanel] Invalid firstGid: ${spriteSetRef.firstGid}`)
      return
    }

    // Validate sprite index
    if (sprite.index < 0) {
      console.warn(`[MapEditorPanel] Invalid sprite index: ${sprite.index}`)
      return
    }

    // Calculate global tile ID: sprite.index + firstGid
    const globalTileId = sprite.index + spriteSetRef.firstGid

    // Validate global tile ID
    if (globalTileId < 0) {
      console.warn(`[MapEditorPanel] Calculated global tile ID is negative: ${globalTileId}`)
      return
    }

    this.emit('tile-selected', globalTileId)
  }

  /**
   * Handle tool button toggles
   */
  private _onBrushToggled(button: Gtk.ToggleButton): void {
    if (button.active) {
      this._eraserButton.active = false
      console.log('[MapEditorPanel] Brush tool selected')
      this.emit('tool-changed', 'brush')
    }
  }

  private _onEraserToggled(button: Gtk.ToggleButton): void {
    if (button.active) {
      this._brushButton.active = false
      console.log('[MapEditorPanel] Eraser tool selected')
      this.emit('tool-changed', 'eraser')
    }
  }

  /**
   * Set multiple tilesets at once
   * @param tilesets Array of sprite sheets to display as tilesets
   */
  private setTilesets(tilesets: GdkSpriteSheet[]): void {
    this._tilesetSelector.tilesets = tilesets
  }

  /**
   * Get the ViewStack for external control (e.g., ViewSwitcherBar)
   * @returns The internal ViewStack
   */
  get stack(): Adw.ViewStack {
    return this._stack
  }

  /**
   * Set the initial tool state
   * @param tool The tool to activate
   */
  setInitialTool(tool: 'brush' | 'eraser'): void {
    if (tool === 'brush' && this._brushButton) {
      this._brushButton.active = true
    } else if (tool === 'eraser' && this._eraserButton) {
      this._eraserButton.active = true
    }
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    this.signals.connect(this._tilesetSelector, 'sprite-selected', this._onSpriteSelected.bind(this))
    this.signals.connect(this._brushButton, 'toggled', this._onBrushToggled.bind(this))
    this.signals.connect(this._eraserButton, 'toggled', this._onEraserToggled.bind(this))
    this.signals.connect(this._layerSelector, 'layer-selected', (_: LayerSelector, layerId: string) => {
      this.emit('layer-selected', layerId)
    })
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(MapEditorPanel.$gtype)
