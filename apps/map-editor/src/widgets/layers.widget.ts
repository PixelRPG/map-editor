import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../g-objects/layer.ts'
// import { LayerWidget } from './layer.widget.ts'

import Template from './layers.widget.ui?raw'

interface _LayersWidget {
  // Properties
  _layers: InstanceType<typeof Layer>[]

  // Widgets
  _listBox: Gtk.ListBox
}

class _LayersWidget extends Adw.Bin {
  constructor(layersObject: InstanceType<typeof Layer>[]) {

    super({})
    this._layers = layersObject;

    for (const layer of this._layers) {
      // TODO: LayerWidget?
      const actionRow = new Adw.ActionRow({
        title: layer.name,
        subtitle: layer.class || '',
      });
      this._listBox.append(actionRow);
    }

    this._listBox.connect("row-activated", this.onRowActivated);
    this._listBox.connect("row-selected", this.onRowSelected);
  }

  onRowActivated(box: Gtk.ListBox, row: Adw.ActionRow) {
    console.log("Activated layer:", row);
  }

  onRowSelected(box: Gtk.ListBox, row: Adw.ActionRow) {
    console.log("Selected layer:", row);
  }
}

export const LayersWidget = GObject.registerClass(
  {
    GTypeName: 'LayersWidget',
    Template,
    InternalChildren: ['listBox'],
    Properties: {
      layers: GObject.ParamSpec.jsobject<InstanceType<typeof Layer>[]>('layers', 'Layers', 'Layers', GObject.ParamFlags.READWRITE),
    },
  },
  _LayersWidget
)
