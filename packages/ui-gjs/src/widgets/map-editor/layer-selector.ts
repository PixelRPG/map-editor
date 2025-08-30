import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import Template from './layer-selector.blp'

// Generic type for layer widgets - can be extended as needed
export type LayersWidget = Gtk.Widget

export class LayerSelector extends Adw.Bin {
  declare _placeholder_box: Gtk.Box
  declare _layers_scrolled_window: Gtk.ScrolledWindow

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerSelector',
        Template,
        InternalChildren: ['placeholder_box', 'layers_scrolled_window'],
      },
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Set the layers widget for layer display
   * @param layersWidget The layers widget to display
   */
  setLayers(layersWidget: LayersWidget) {
    if (layersWidget && this._layers_scrolled_window) {
      this._layers_scrolled_window.set_child(layersWidget)
    } else {
      console.error('[LayerSelector] Missing layers widget or scrolled window')
    }
  }
}

GObject.type_ensure(LayerSelector.$gtype)
