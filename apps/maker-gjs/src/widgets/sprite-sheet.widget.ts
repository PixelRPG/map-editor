import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'

import { SpriteWidget } from './sprite.widget.ts'

import Template from './sprite-sheet.widget.ui?raw'
import { SpriteSheet } from '../g-objects/sprite-sheet.ts'

export class SpriteSheetWidget extends Gtk.ScrolledWindow {

  // GObject properties
  declare _spriteSheet: SpriteSheet

  // GObject internal children
  declare _flowBox: Gtk.FlowBox

  static {
    GObject.registerClass({
      GTypeName: 'SpriteSheetWidget',
      Template,
      InternalChildren: ['flowBox'],
      Properties: {
        spriteSheet: Object.ParamSpec.object('spriteSheet', 'SpriteSheet', 'SpriteSheet', GObject.ParamFlags.READWRITE as any, SpriteSheet),
      },
    }, this);
  }
  constructor(spriteSheetObject: SpriteSheet) {

    super({})
    this._spriteSheet = spriteSheetObject;
    this.onSelected = this.onSelected.bind(this);

    for (const sprite of spriteSheetObject._sprites) {
      const spriteWidget = new SpriteWidget(sprite);
      this._flowBox.append(spriteWidget);
    }

    this._flowBox.connect("child-activated", this.onSelected);
  }

  onSelected(parent: Gtk.FlowBox, flowBoxChild: Gtk.FlowBoxChild) {
    const spriteWidget = flowBoxChild.child as SpriteWidget;
    const _sprite = spriteWidget._sprite;
    console.log("Selected sprite:", _sprite);
  }
}
