import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { MapPreview, ProjectHeroIcon, SignalScope } from '@pixelrpg/gjs'
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
        ],
        Signals: {
          'create-project': {},
          'open-project': {},
          'browse-projects': {},
          'take-tour': {},
          'template-selected': { param_types: [GObject.TYPE_STRING] },
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

  private _buildTemplateGrid(): void {
    const cols = 2
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
    preview.set_size_request(180, 100)
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
