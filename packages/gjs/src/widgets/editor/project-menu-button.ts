import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
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

  /**
   * The template's own `primary_menu`, cached on the first
   * {@link setExtraSection} call — after that the button's model is a
   * composed one, so it can no longer be read back off the button.
   */
  private _primaryMenu: Gio.MenuModel | null = null

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

  /**
   * Put a view's own items at the top of the menu, above the app-wide
   * ones — the World view's "Show as list" is the first of them
   * (REDESIGN.md § 4.2). `null` restores the plain primary menu.
   *
   * The section is passed in as a model instead of being declared in
   * `project-menu-button.blp`, because a Blueprint `menu` is scoped to
   * its own template: the items belong to whichever view placed the
   * button, and this widget is shared by four of them.
   *
   * A fresh root menu is built per call rather than the section being
   * appended to `primary_menu` in place: `primary_menu` is the
   * template's resource, shared by every instance, so mutating it would
   * leak the World view's item into the map editor's context pill.
   */
  setExtraSection(section: Gio.MenuModel | null): void {
    this._primaryMenu ??= this._menu_button.get_menu_model()
    const primary = this._primaryMenu
    if (!section) {
      this._menu_button.set_menu_model(primary)
      return
    }
    const root = new Gio.Menu()
    root.append_section(null, section)
    // Copied section by section, not as one nested model: appending
    // `primary` whole would render it as a submenu's worth of items in
    // a single separator group and lose its own grouping.
    for (let i = 0; i < (primary?.get_n_items() ?? 0); i++) {
      const existing = primary?.get_item_link(i, Gio.MENU_LINK_SECTION)
      if (existing) root.append_section(null, existing)
    }
    this._menu_button.set_menu_model(root)
  }
}

GObject.type_ensure(ProjectMenuButton.$gtype)
