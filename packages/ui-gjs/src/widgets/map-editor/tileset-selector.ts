import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { SpriteSheetWidget } from '../sprite/sprite-sheet.widget'

import Template from './tileset-selector.blp'

export class TilesetSelector extends Adw.Bin {
  declare _placeholder_box: Gtk.Box

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesetSelector',
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
   * Set the sprite sheet widget for tileset display
   * @param spriteSheet The sprite sheet widget to display
   */
  setSpriteSheet(spriteSheet: SpriteSheetWidget) {
    // Replace the placeholder with the actual sprite sheet
    if (this._placeholder_box && spriteSheet) {
      const parent = this._placeholder_box.get_parent() as Gtk.Box
      if (parent && parent.remove && parent.append) {
        parent.remove(this._placeholder_box)
        parent.append(spriteSheet)
      }
    }
  }
}

GObject.type_ensure(TilesetSelector.$gtype)
