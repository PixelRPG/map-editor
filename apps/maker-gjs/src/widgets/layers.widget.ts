import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../objects/layer.ts'
import { LayerRowWidget } from './layer-row.widget.ts'

import Template from './layers.widget.ui?raw'

export class LayersWidget extends Adw.Bin {

  // GObject properties
  declare _layers: Layer[]

  // GObject internal children
  declare _listBox: Gtk.ListBox

  static {
    GObject.registerClass({
      GTypeName: 'LayersWidget',
      Template,
      InternalChildren: ['listBox'],
      Properties: {
        layers: GObject.ParamSpec.jsobject<Layer[]>('layers', 'Layers', 'Layers', GObject.ParamFlags.READWRITE),
      },
    }, this);
  }

  constructor(layersObject: Layer[]) {

    super({})
    this._layers = layersObject;

    for (const layer of this._layers) {
      const actionRow = new LayerRowWidget(layer);
      this._listBox.append(actionRow);
    }

    this._listBox.connect("row-activated", this.onRowActivated);
    this._listBox.connect("row-selected", this.onRowSelected);
  }

  onRowActivated(box: Gtk.ListBox, row: LayerRowWidget) {
    console.log("[LayersWidget] Activated layer:", row._layer);
  }

  onRowSelected(box: Gtk.ListBox, row: LayerRowWidget) {
    console.log("[LayersWidget] Selected layer:", row._layer);
    row.activate();
  }
}

GObject.type_ensure(LayersWidget.$gtype)