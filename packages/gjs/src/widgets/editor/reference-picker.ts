import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import type { FieldOption } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

/**
 * The picker a generated reference row opens — REDESIGN § 4.4's "pushes a
 * picker page" as a DIALOG instead.
 *
 * A pushed page would need a navigation stack, and the row's two hosts
 * have none: the library's `Adw.NavigationSplitView` keeps exactly two
 * pages (gallery + detail) so the scene canvas is never reparented, and
 * the right-hand inspector is a plain pane. A dialog reaches both without
 * either growing a stack, and reads the same on phone, where libadwaita
 * presents it as a bottom sheet.
 *
 * Built imperatively like `scene-editor/door-target-dialog.ts`: a
 * throwaway form with no state worth keeping between presentations. The
 * row IS the choice, so there is no confirm button.
 */

/** Smallest size the dialog gets; the list scrolls inside it. */
const DIALOG_WIDTH = 360
const DIALOG_HEIGHT = 480

/** Side length of a row's thumbnail square, in px. */
const THUMB_PX = 40

export interface ReferencePickerOptions {
  /** Dialog title — the field's label, already translated. */
  readonly title: string
  /**
   * Every choice, including the leading "(None)" sentinel (value `''`),
   * with labels already display-ready (see `_optionsFor`).
   */
  readonly options: readonly FieldOption[]
  /** The value the field holds today, marked in the list. */
  readonly selected: string
  /**
   * Symbolic icon standing in for the referenced thing's picture. The
   * options carry labels only, so there is nothing truer to draw yet —
   * see TODO.md § Library.
   */
  readonly icon: string
}

/** Present the picker for one reference field. */
export function presentReferencePicker(
  parent: Gtk.Widget,
  options: ReferencePickerOptions,
  onChoose: (value: string) => void,
): void {
  const dialog = new Adw.Dialog({
    title: options.title,
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const group = new Adw.PreferencesGroup()
  if (options.options.length === 0) {
    group.set_description(_('There is nothing to point at yet.'))
  }
  for (const option of options.options) {
    const isNone = option.value === ''
    const row = new Adw.ActionRow({
      title: option.label,
      // Labels for maps, appearances and sprite sets are user data: a map
      // called "Cliffs <of> Doom" must read as itself, not vanish into a
      // broken tag.
      useMarkup: false,
      activatable: true,
    })
    if (!isNone) row.add_prefix(thumbnail(options.icon))
    if (option.value === options.selected) {
      row.add_suffix(new Gtk.Image({ iconName: 'object-select-symbolic', valign: Gtk.Align.CENTER }))
    }
    row.connect('activated', () => {
      dialog.close()
      onChoose(option.value)
    })
    group.add(row)
  }

  const page = new Adw.PreferencesPage()
  page.add(group)

  const view = new Adw.ToolbarView({ content: page })
  view.add_top_bar(new Adw.HeaderBar())
  dialog.set_child(view)
  dialog.present(parent)
}

function thumbnail(icon: string): Gtk.Widget {
  return new Adw.Bin({
    widthRequest: THUMB_PX,
    heightRequest: THUMB_PX,
    valign: Gtk.Align.CENTER,
    overflow: Gtk.Overflow.HIDDEN,
    child: new Gtk.Image({ iconName: icon, pixelSize: 24 }),
  })
}
