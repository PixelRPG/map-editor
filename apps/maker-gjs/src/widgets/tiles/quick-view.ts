import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition } from '@pixelrpg/engine'
import { CharacterPreview, type GdkSpriteSetResource } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './quick-view.blp'

// Force registration so the blueprint's `$PixelRpgCharacterPreview` ref
// resolves when this template is parsed.
GObject.type_ensure(CharacterPreview.$gtype)

/** A tileset glance: the sheet mosaic plus its name and tile count. */
export interface TilesetGlance {
  thumbnail: Gdk.Paintable | null
  title: string
  subtitle: string
}

/** An appearance glance: the sheet animated through a synthetic character. */
export interface AppearanceGlance {
  character: CharacterDefinition
  spriteSet: GdkSpriteSetResource | null
  subtitle: string
}

/**
 * The Graphics page's desktop quick-view sidebar — one read-only glance
 * shared by both galleries. Purely presentational: the view says WHICH
 * glance to show, and the edit button surfaces as `edit-requested` so
 * the view can route it (a tileset opens its detail page, an appearance
 * jumps to the Characters matrix). The glance names its kind and the
 * button says where it goes, so a glance whose card has scrolled out of
 * view is still unambiguous.
 */
export class TilesQuickView extends Adw.Bin {
  declare _stack: Gtk.Stack
  declare _preview_stack: Gtk.Stack
  declare _thumb: Gtk.Picture
  declare _preview: CharacterPreview
  declare _kind_label: Gtk.Label
  declare _name_label: Gtk.Label
  declare _subtitle_label: Gtk.Label
  declare _edit_button: Gtk.Button

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesQuickView',
        Template,
        InternalChildren: [
          'stack',
          'preview_stack',
          'thumb',
          'preview',
          'kind_label',
          'name_label',
          'subtitle_label',
          'edit_button',
        ],
        Signals: {
          // The "Edit" button was clicked for whatever is being glanced at.
          'edit-requested': {},
        },
      },
      TilesQuickView,
    )
  }

  constructor() {
    super()
    this._edit_button.connect('clicked', () => {
      this.emit('edit-requested')
    })
  }

  /** Show the "nothing selected" state. */
  showEmpty(): void {
    this._stack.set_visible_child_name('empty')
  }

  /**
   * Show the empty state after a TILESET selection went away, dropping the
   * sheet thumbnail so the hidden page stops holding the last texture.
   */
  clearTileset(): void {
    this.showEmpty()
    this._thumb.set_paintable(null)
  }

  showTileset(glance: TilesetGlance): void {
    this._stack.set_visible_child_name('info')
    this._preview_stack.set_visible_child_name('tileset')
    this._thumb.set_paintable(glance.thumbnail)
    this._kind_label.set_label(_('Tileset'))
    this._name_label.set_label(glance.title)
    this._subtitle_label.set_label(glance.subtitle)
    this._edit_button.set_label(_('Configure tiles'))
  }

  showAppearance(glance: AppearanceGlance): void {
    this._stack.set_visible_child_name('info')
    this._preview_stack.set_visible_child_name('appearance')
    this._preview.setCharacter(glance.character, glance.spriteSet)
    this._kind_label.set_label(_('Appearance'))
    this._name_label.set_label(glance.character.name)
    this._subtitle_label.set_label(glance.subtitle)
    this._edit_button.set_label(_('Edit animations'))
  }
}

GObject.type_ensure(TilesQuickView.$gtype)
