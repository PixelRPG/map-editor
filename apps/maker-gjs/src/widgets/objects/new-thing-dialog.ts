import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'
import type { EntityTemplate } from '../../services/entity-templates.ts'
import { nextThingName, resolveThingName } from '../../services/new-thing-draft.ts'

/**
 * The "New thing" dialog of REDESIGN.md § 6.6: page one a grid of
 * template cards (picture + name + one line), page two the name.
 *
 * Built imperatively like `door-target-dialog.ts` and
 * `add-component-dialog.ts` — a throwaway form with no state worth
 * keeping between presentations. The only part with a rule behind it is
 * the name it opens on, and that lives in `services/new-thing-draft.ts`
 * with its own spec.
 */

/** Smallest size the dialog gets; the grid scrolls inside it. */
const DIALOG_WIDTH = 440
const DIALOG_HEIGHT = 480

/** What the dialog needs to know about the project it creates into. */
export interface NewThingOptions {
  /** The project's effective templates, already filtered for the tier. */
  readonly templates: readonly EntityTemplate[]
  /** Every name the entity library already holds — one namespace. */
  readonly existingNames: readonly string[]
}

/**
 * Present the two-page new-thing dialog. `onCreate` fires once, with the
 * template the person picked and the name they settled on.
 *
 * The grid is flat rather than grouped per game system: `EntityTemplate`
 * carries no owning-system id, so grouping would mean guessing.
 */
export function presentNewThingDialog(
  parent: Gtk.Widget,
  options: NewThingOptions,
  onCreate: (templateId: string, name: string) => void,
): void {
  const dialog = new Adw.Dialog({
    title: _('New thing'),
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })
  const navigation = new Adw.NavigationView()
  dialog.set_child(navigation)

  navigation.add(
    templatePage(options.templates, (template) => {
      // Built fresh per pick, so going Back and choosing another
      // template re-derives the suggested name instead of showing the
      // first template's.
      navigation.push(
        namePage(template, options.existingNames, (name) => {
          dialog.close()
          onCreate(template.id, name)
        }),
      )
    }),
  )

  dialog.present(parent)
}

/** Page one: every offered template as a card. */
function templatePage(
  templates: readonly EntityTemplate[],
  onPick: (template: EntityTemplate) => void,
): Adw.NavigationPage {
  const grid = new Gtk.FlowBox({
    selectionMode: Gtk.SelectionMode.NONE,
    minChildrenPerLine: 2,
    maxChildrenPerLine: 2,
    columnSpacing: 12,
    rowSpacing: 12,
    homogeneous: true,
    marginTop: 12,
    marginBottom: 12,
    marginStart: 12,
    marginEnd: 12,
  })
  for (const template of templates) {
    // Characters are created on the Characters chip, with their own
    // dialog — offering the template here would make two front doors to
    // one thing.
    if (template.id === 'character') continue
    grid.append(templateCard(template, () => onPick(template)))
  }

  const scroller = new Gtk.ScrolledWindow({ hscrollbarPolicy: Gtk.PolicyType.NEVER, child: grid, vexpand: true })
  const view = new Adw.ToolbarView({ content: scroller })
  view.add_top_bar(new Adw.HeaderBar())
  return new Adw.NavigationPage({ title: _('New thing'), child: view })
}

/**
 * One template as a card — the welcome view's pattern (a `card` button
 * holding a vertical box), so the two places that offer "start from a
 * template" look like one idea.
 */
function templateCard(template: EntityTemplate, onClick: () => void): Gtk.Button {
  const button = new Gtk.Button({ cssClasses: ['card'] })
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    marginTop: 12,
    marginBottom: 12,
    marginStart: 12,
    marginEnd: 12,
  })
  box.append(new Gtk.Image({ iconName: template.icon, pixelSize: 32, halign: Gtk.Align.START }))
  // The template data keeps its msgids literal English (the
  // `thing-categories.ts` precedent); they are translated at the widget.
  box.append(new Gtk.Label({ label: _(template.label), halign: Gtk.Align.START, cssClasses: ['heading'] }))
  box.append(
    new Gtk.Label({
      label: _(template.description),
      halign: Gtk.Align.START,
      xalign: 0,
      wrap: true,
      cssClasses: ['caption', 'dim-label'],
    }),
  )
  button.set_child(box)
  button.connect('clicked', onClick)
  return button
}

/** Page two: the name, opening on the suggestion for that template. */
function namePage(
  template: EntityTemplate,
  existingNames: readonly string[],
  onCreate: (name: string) => void,
): Adw.NavigationPage {
  const suggestion = nextThingName(_(template.label), existingNames)
  const entry = new Adw.EntryRow({ title: _('Name'), text: suggestion })
  const group = new Adw.PreferencesGroup()
  group.add(entry)

  const create = new Gtk.Button({ label: _('Create'), cssClasses: ['suggested-action'] })
  const commit = () => onCreate(resolveThingName(entry.get_text(), suggestion))
  create.connect('clicked', commit)
  entry.connect('entry-activated', commit)

  const header = new Adw.HeaderBar()
  header.pack_end(create)

  const page = new Adw.PreferencesPage()
  page.add(group)
  const view = new Adw.ToolbarView({ content: page })
  view.add_top_bar(header)

  const navPage = new Adw.NavigationPage({ title: _(template.label), child: view })
  navPage.connect('shown', () => {
    // The push animation is still running when `shown` fires, and a
    // grab during it lands nowhere.
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      entry.grab_focus()
      return GLib.SOURCE_REMOVE
    })
  })
  return navPage
}
