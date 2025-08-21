import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'

import { SpriteWidget } from './sprite.widget'
import { SpriteSheet } from '@pixelrpg/data-gjs'

import Template from './sprite-sheet.widget.blp'

/**
 * Widget for displaying a sprite sheet as a grid of sprites
 */
export class SpriteSheetWidget extends Gtk.ScrolledWindow {
  // GObject properties
  declare _spriteSheet: SpriteSheet

  // GObject internal children
  declare _flowBox: Gtk.FlowBox

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteSheetWidget',
        Template,
        InternalChildren: ['flowBox'],
        Properties: {
          spriteSheet: Object.ParamSpec.object(
            'spriteSheet',
            'SpriteSheet',
            'SpriteSheet',
            GObject.ParamFlags.READWRITE as any,
            SpriteSheet,
          ),
        },
      },
      this,
    )
  }
  constructor(spriteSheetObject: SpriteSheet) {
    super({})
    this._spriteSheet = spriteSheetObject
    this.onSelected = this.onSelected.bind(this)

    for (const sprite of spriteSheetObject.sprites) {
      const spriteWidget = new SpriteWidget(sprite)
      this._flowBox.append(spriteWidget)
    }

    this._flowBox.connect('child-activated', this.onSelected)
  }

  onSelected(parent: Gtk.FlowBox, flowBoxChild: Gtk.FlowBoxChild) {
    const spriteWidget = flowBoxChild.child as SpriteWidget
    const sprite = spriteWidget.sprite
    console.log('Selected sprite:', sprite)
  }
}

GObject.type_ensure(SpriteSheetWidget.$gtype)
