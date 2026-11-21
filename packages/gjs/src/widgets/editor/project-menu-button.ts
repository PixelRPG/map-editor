import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './project-menu-button.blp'

/**
 * Share button plus the app's primary menu, as one drop-in group for a
 * header bar or an overlay pill.
 *
 * Both used to live in the mode rail's hero row, which was the only
 * place in the app that carried them. The navigation redesign
 * (REDESIGN.md § 3.1) replaced the rail with a view switcher, so the
 * pair moved into a widget that every shell destination — World,
 * Library, Game and the map editor's context pill — can place at the
 * end of its own header.
 */
export class ProjectMenuButton extends Adw.Bin {
  declare _menu_button: Gtk.MenuButton

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgProjectMenuButton',
        Template,
        InternalChildren: ['menu_button'],
      },
      ProjectMenuButton,
    )
  }
}

GObject.type_ensure(ProjectMenuButton.$gtype)
