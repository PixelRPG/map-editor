import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'

import { Tileset } from '../g-objects/tileset.ts'
import { Sprite } from '../g-objects/sprite.ts'
import { SpriteWidget } from './sprite.widget.ts'

import Template from './tileset.widget.ui?raw'

interface _TilesetWidget {
  // Properties
  _tileset: InstanceType<typeof Tileset>

  // Widgets
  _flowBox: Gtk.FlowBox
}

class _TilesetWidget extends Gtk.ScrolledWindow {
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

export const TilesetWidget = GObject.registerClass(
  {
    GTypeName: 'TilesetWidget',
    Template,
    InternalChildren: ['flowBox'],
    Properties: {
      tileset: Object.ParamSpec.object('tileset', 'Tileset', 'Tileset', GObject.ParamFlags.READWRITE as any, Tileset),
    },
  },
  _TilesetWidget
)
