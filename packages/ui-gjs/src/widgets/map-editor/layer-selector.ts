import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import Template from './layer-selector.blp'

// Generic type for layer widgets - can be extended as needed
export type LayersWidget = Gtk.Widget

export class LayerSelector extends Adw.Bin {
  declare _placeholder_box: Gtk.Box

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerSelector',
        Template,
        InternalChildren: ['placeholder_box'],
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
    // Replace the placeholder with the actual layers widget
    if (this._placeholder_box && layersWidget) {
      const parent = this._placeholder_box.get_parent() as Gtk.Box
      if (parent && parent.remove && parent.append) {
        parent.remove(this._placeholder_box)
        parent.append(layersWidget)
      }
    }
  }
}

GObject.type_ensure(LayerSelector.$gtype)
