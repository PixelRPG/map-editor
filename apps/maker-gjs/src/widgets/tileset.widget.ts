import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'

import { Tileset } from '../g-objects/tileset.ts'
import { SpriteWidget } from './sprite.widget.ts'

import Template from './tileset.widget.ui?raw'

export interface TilesetWidget {
  // Properties
  _tileset: InstanceType<typeof Tileset>

  // Widgets
  _flowBox: Gtk.FlowBox
}

export class TilesetWidget extends Gtk.ScrolledWindow {
  static {
    GObject.registerClass({
      GTypeName: 'TilesetWidget',
      Template,
      InternalChildren: ['flowBox'],
      Properties: {
        tileset: Object.ParamSpec.object('tileset', 'Tileset', 'Tileset', GObject.ParamFlags.READWRITE as any, Tileset),
      },
    }, this);
  }
  constructor(tilesetObject: InstanceType<typeof Tileset>) {

    super({})
    this._tileset = tilesetObject;
    this.onSelected = this.onSelected.bind(this);

    for (const sprite of tilesetObject._spriteSheet._sprites) {
      const spriteWidget = new SpriteWidget(sprite);
      this._flowBox.append(spriteWidget);
    }

    this._flowBox.connect("child-activated", this.onSelected);
  }

  onSelected(parent: Gtk.FlowBox, flowBoxChild: Gtk.FlowBoxChild) {
    const spriteWidget = flowBoxChild.child as InstanceType<typeof SpriteWidget>;
    const _sprite = spriteWidget._sprite;
    console.log("Selected sprite:", _sprite);
  }
}
