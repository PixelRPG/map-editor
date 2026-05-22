import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { MapPreview, ProjectHeroIcon, SignalScope } from '@pixelrpg/gjs'
import type { RecentProject } from '../services/recent-projects.ts'
import { STARTER_TEMPLATES } from '../services/templates.ts'

import Template from './welcome-view.blp'

GObject.type_ensure(ProjectHeroIcon.$gtype)
GObject.type_ensure(MapPreview.$gtype)

/**
 * Welcome / home view.
 *
 * Two columns at desktop width — hero + CTA + template strip on the
 * left, recent projects + tour CTA on the right. Below the
 * `tightening-threshold` of the `Adw.Clamp`, both columns reflow to a
 * single stacked layout.
 *
 * Template cards render a **live map preview** for each
 * `STARTER_TEMPLATES` entry by loading its `game-project.json` and
 * compositing the first map's tiles via {@link MapPreview}. Picking a
 * card emits `template-selected::<id>` so the application window can
 * load that template into the editor — the same code path as "Open
 * Project" with a known starting file.
 */
export class WelcomeView extends Adw.Bin {
  declare _hero_icon: ProjectHeroIcon
  declare _create_button: Gtk.Button
  declare _open_button: Gtk.Button
  declare _browse_button: Gtk.Button
  declare _tour_button: Gtk.Button
  declare _templates_grid: Gtk.Grid
  declare _recents_list: Gtk.ListBox
  declare _empty_recents_row: Adw.ActionRow

  private _recentRows: Gtk.Widget[] = []

  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'WelcomeView',
        Template,
        InternalChildren: [
          'hero_icon',
          'create_button',
          'open_button',
          'browse_button',
          'tour_button',
          'templates_grid',
          'recents_list',
          'empty_recents_row',
        ],
        Signals: {
          'create-project': {},
          'open-project': {},
          'browse-projects': {},
          'take-tour': {},
          'template-selected': { param_types: [GObject.TYPE_STRING] },
          'recent-selected': { param_types: [GObject.TYPE_STRING] },
        },
      },
      WelcomeView,
    )
  }

  constructor() {
    super()
    this._buildTemplateGrid()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._create_button, 'clicked', () => this.emit('create-project'))
    this.signals.connect(this._open_button, 'clicked', () => this.emit('open-project'))
    this.signals.connect(this._browse_button, 'clicked', () => this.emit('browse-projects'))
    this.signals.connect(this._tour_button, 'clicked', () => this.emit('take-tour'))
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Populate the recent-projects list. Passing an empty array (or
   * never calling this) keeps the built-in "No recent projects"
   * placeholder visible.
   */
  setRecentProjects(recents: RecentProject[]): void {
    for (const row of this._recentRows) this._recents_list.remove(row)
    this._recentRows = []

    if (!recents.length) {
      this._empty_recents_row.set_visible(true)
      return
    }
    this._empty_recents_row.set_visible(false)

    for (const recent of recents) {
      const row = new Adw.ActionRow({
        title: recent.name,
        subtitle: recent.caption || recent.path,
        activatable: true,
      })
      row.add_prefix(new Gtk.Image({ icon_name: 'folder-symbolic', pixel_size: 22 }))
      row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 12 }))
      row.connect('activated', () => this.emit('recent-selected', recent.path))
      this._recents_list.append(row)
      this._recentRows.push(row)
    }
  }

  private _buildTemplateGrid(): void {
    // Five templates ship today; three columns keep the grid to two rows
    // and the cards small enough that the toast overlay isn't forced
    // outside the window's vertical allocation.
    const cols = 3
    STARTER_TEMPLATES.forEach((template, index) => {
      const button = this._buildTemplateCard(template)
      this._templates_grid.attach(button, index % cols, Math.floor(index / cols), 1, 1)
    })
  }

  private _buildTemplateCard(template: { id: string; name: string; caption: string; projectPath: string; accentColor: string }): Gtk.Button {
    const button = new Gtk.Button({ css_classes: ['card'] })
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 10,
      margin_bottom: 10,
      margin_start: 10,
      margin_end: 10,
    })

    const preview = new MapPreview()
    preview.accentColor = template.accentColor
    preview.set_size_request(150, 88)
    preview.add_css_class('engine-canvas')
    // Defer the load to the next tick so the grid lays out first and
    // the four previews don't all block the main loop in a row.
    void Promise.resolve().then(() => preview.loadProject(template.projectPath))

    const name = new Gtk.Label({ label: template.name, halign: Gtk.Align.START })
    name.add_css_class('heading')
    const caption = new Gtk.Label({ label: template.caption, halign: Gtk.Align.START })
    caption.add_css_class('caption')
    caption.add_css_class('dim-label')

    box.append(preview)
    box.append(name)
    box.append(caption)
    button.set_child(box)
    button.connect('clicked', () => this.emit('template-selected', template.id))
    return button
  }
}

GObject.type_ensure(WelcomeView.$gtype)
