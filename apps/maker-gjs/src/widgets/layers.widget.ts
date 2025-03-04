import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../g-objects/layer.ts'
import { LayerRowWidget } from './layer-row.widget.ts'

import Template from './layers.widget.ui?raw'

export interface LayersWidget {
  // Properties
  _layers: InstanceType<typeof Layer>[]

  // Widgets
  _listBox: Gtk.ListBox
}

export class LayersWidget extends Adw.Bin {

  static {
    GObject.registerClass({
      GTypeName: 'LayersWidget',
      Template,
      InternalChildren: ['listBox'],
      Properties: {
        layers: GObject.ParamSpec.jsobject<InstanceType<typeof Layer>[]>('layers', 'Layers', 'Layers', GObject.ParamFlags.READWRITE),
      },
    }, this);
  }

  constructor(layersObject: InstanceType<typeof Layer>[]) {

    super({})
    this._layers = layersObject;

    for (const layer of this._layers) {
      const actionRow = new LayerRowWidget(layer);
      this._listBox.append(actionRow);
    }

    this._listBox.connect("row-activated", this.onRowActivated);
    this._listBox.connect("row-selected", this.onRowSelected);
  }

  onRowActivated(box: Gtk.ListBox, row: InstanceType<typeof LayerRowWidget>) {
    console.log("[LayersWidget] Activated layer:", row._layer);
  }

  onRowSelected(box: Gtk.ListBox, row: InstanceType<typeof LayerRowWidget>) {
    console.log("[LayersWidget] Selected layer:", row._layer);
    row.activate();
  }
}
