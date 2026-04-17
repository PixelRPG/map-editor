import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { TilesetSelector } from './tileset-selector'
import { LayerSelector } from './layer-selector'
import { GdkSpriteSheet } from '../../sprite'
import { MapData } from '@pixelrpg/engine'

import Template from './map-editor-panel.blp'

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
  private _signalHandlers: number[] = []

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
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Initialize the map editor panel with map data including tilesets and layers
   * @param mapData The map data containing layers and sprite set references
   * @param spriteSheets Array of loaded sprite sheets
   */
  initializeMapData(mapData: MapData, spriteSheets: GdkSpriteSheet[]): void {
    console.log(
      '[MapEditorPanel] Initializing with map:',
      mapData.name || mapData.id,
    )
    console.log(
      '[MapEditorPanel] Available sprite sheets:',
      spriteSheets.length,
    )
    console.log('[MapEditorPanel] Map layers:', mapData.layers.length)

    // Store the map data for tile ID calculations
    this._mapData = mapData

    // Set the tilesets (sprite sheets)
    this.setTilesets(spriteSheets)

    // Set the map data in the layer selector
    this._layerSelector.setMapData(mapData)

    // Connect layer selector signal to forward it
    this._layerSelector.connect(
      'layer-selected',
      (_: LayerSelector, layerId: string) => {
        this.emit('layer-selected', layerId)
      },
    )
  }

  /**
   * Handle sprite selection from tileset selector
   * Convert sprite selection to global tile ID and emit tile-selected signal
   */
  private _onSpriteSelected(
    sender: any,
    sprite: any,
    tilesetIndex: number,
  ): void {
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
      console.warn(
        `[MapEditorPanel] Sprite set reference not found for tileset index: ${tilesetIndex}`,
      )
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

    if (this._signalHandlers.length === 0) {
      // Connect tileset selector signal
      const tilesetHandlerId = this._tilesetSelector.connect(
        'sprite-selected',
        this._onSpriteSelected.bind(this),
      )
      this._signalHandlers.push(tilesetHandlerId)

      // Connect tool button signals
      const brushHandlerId = this._brushButton.connect(
        'toggled',
        this._onBrushToggled.bind(this),
      )
      this._signalHandlers.push(brushHandlerId)

      const eraserHandlerId = this._eraserButton.connect(
        'toggled',
        this._onEraserToggled.bind(this),
      )
      this._signalHandlers.push(eraserHandlerId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers
      // Note: We need to disconnect from the correct widgets
      // The first handler is for tileset selector
      if (this._signalHandlers[0] > 0) {
        this._tilesetSelector.disconnect(this._signalHandlers[0])
      }
      // The second handler is for brush button
      if (this._signalHandlers[1] > 0) {
        this._brushButton.disconnect(this._signalHandlers[1])
      }
      // The third handler is for eraser button
      if (this._signalHandlers[2] > 0) {
        this._eraserButton.disconnect(this._signalHandlers[2])
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(MapEditorPanel.$gtype)
