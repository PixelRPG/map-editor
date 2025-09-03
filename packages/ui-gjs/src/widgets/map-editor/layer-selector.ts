import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import Template from './layer-selector.blp'
import './layer-selector.css'

// Generic type for layer widgets - can be extended as needed
export type LayersWidget = Gtk.Widget

// Import MapData type - assuming it's available
import type { MapData } from '@pixelrpg/data-core'

export class LayerSelector extends Adw.Bin {
  declare _placeholder_box: Gtk.Box
  declare _layers_scrolled_window: Gtk.ScrolledWindow

  private _selectedLayerId: string | null = null
  private _layerElements: Array<{ box: Gtk.Box; icon: Gtk.Label; layer: any }> =
    []

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerSelector',
        Template,
        InternalChildren: ['placeholder_box', 'layers_scrolled_window'],
        Signals: {
          'layer-selected': {
            param_types: [GObject.TYPE_STRING],
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
   * Set the map data and create layer selection UI
   * @param mapData The map data containing layers
   */
  setMapData(mapData: MapData): void {
    if (!this._layers_scrolled_window) {
      console.error('[LayerSelector] Missing layers scrolled window')
      return
    }

    // Clear existing layers
    this._layerElements = []
    this._selectedLayerId = null

    const layersBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_top: 6,
      margin_bottom: 6,
      margin_start: 6,
      margin_end: 6,
    })

    // Create layer selection UI
    for (const layer of mapData.layers) {
      // Create a clickable box for each layer
      const layerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        margin_bottom: 2,
      })

      // Layer visibility/selection indicator
      const visibilityIcon = new Gtk.Label({
        label: layer.visible ? '👁' : '🚫',
        tooltip_text: layer.visible ? 'Layer visible' : 'Layer hidden',
      })

      // Layer name as clickable button - use name if available, otherwise id
      const displayName = layer.name || `Layer ${layer.id}`
      const layerButton = new Gtk.Button({
        label: displayName,
        tooltip_text: `Click to select layer: ${displayName}`,
        has_frame: false,
        halign: Gtk.Align.START,
      })

      // Store reference for easy updates
      this._layerElements.push({ box: layerBox, icon: visibilityIcon, layer })

      // Set the first visible layer as selected by default
      if (!this._selectedLayerId && layer.visible) {
        this._selectedLayerId = layer.id
        layerButton.add_css_class('layer-selected')
        visibilityIcon.label = '🎯' // Selected indicator
      }

      // Connect to the clicked signal
      layerButton.connect('clicked', () => {
        this.selectLayer(layer.id)
      })

      layerBox.append(visibilityIcon)
      layerBox.append(layerButton)
      layersBox.append(layerBox)
    }

    // If no layer was selected, select the first available layer
    if (!this._selectedLayerId && mapData.layers.length > 0) {
      const firstLayer = mapData.layers[0]
      if (firstLayer) {
        this._selectedLayerId = firstLayer.id
      }
    }

    // Set the layers widget
    this._layers_scrolled_window.set_child(layersBox)

    // Emit initial selection if we have one
    if (this._selectedLayerId) {
      this.emit('layer-selected', this._selectedLayerId)
    }
  }

  /**
   * Select a specific layer by ID
   * @param layerId The ID of the layer to select
   */
  selectLayer(layerId: string): void {
    if (this._selectedLayerId === layerId) return // Already selected

    this._selectedLayerId = layerId
    this.emit('layer-selected', layerId)

    // Update all layer styles
    this._layerElements.forEach(({ box, icon, layer: layerInfo }) => {
      if (layerInfo.id === layerId) {
        box.add_css_class('layer-selected')
        icon.label = '🎯' // Selected indicator
      } else {
        box.remove_css_class('layer-selected')
        icon.label = layerInfo.visible ? '👁' : '🚫'
      }
    })
  }

  /**
   * Get the currently selected layer ID
   */
  get selectedLayerId(): string | null {
    return this._selectedLayerId
  }
}

GObject.type_ensure(LayerSelector.$gtype)
