import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ProjectHeroIcon, SignalScope } from '@pixelrpg/gjs'

import Template from './welcome-view.blp'

GObject.type_ensure(ProjectHeroIcon.$gtype)

interface TemplateOption {
  id: string
  name: string
  caption: string
  iconName: string
}

const STARTER_TEMPLATES: TemplateOption[] = [
  { id: 'blank', name: 'Blank Project', caption: 'Start from scratch', iconName: 'document-new-symbolic' },
  { id: 'overworld', name: 'Overworld', caption: '16×16 tileset · forest', iconName: 'applications-graphics-symbolic' },
  { id: 'dungeon', name: 'Dungeon', caption: '16×16 tileset · stone', iconName: 'view-grid-symbolic' },
  { id: 'town', name: 'Town', caption: 'Houses + paths', iconName: 'user-home-symbolic' },
]

/**
 * Welcome / home view.
 *
 * Two columns at desktop width — hero + CTA + template strip on the
 * left, recent projects + tour CTA on the right. Below the
 * `tightening-threshold` of the `Adw.Clamp`, both columns reflow to a
 * single stacked layout.
 *
 * Emits `create-project` / `open-project` / `template-selected::<id>` /
 * `take-tour` so the application window owns the side effects.
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
    STARTER_TEMPLATES.forEach((option, index) => {
      const button = this._buildTemplateCard(option)
      this._templates_grid.attach(button, index % cols, Math.floor(index / cols), 1, 1)
    })
  }

  private _buildTemplateCard(option: TemplateOption): Gtk.Button {
    const button = new Gtk.Button({ css_classes: ['card'] })
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    })
    const icon = new Gtk.Image({ icon_name: option.iconName, pixel_size: 28 })
    icon.add_css_class('accent')
    const name = new Gtk.Label({ label: option.name, halign: Gtk.Align.START })
    name.add_css_class('heading')
    const caption = new Gtk.Label({ label: option.caption, halign: Gtk.Align.START })
    caption.add_css_class('caption')
    caption.add_css_class('dim-label')
    box.append(icon)
    box.append(name)
    box.append(caption)
    button.set_child(box)
    button.connect('clicked', () => this.emit('template-selected', option.id))
    return button
  }
}

GObject.type_ensure(WelcomeView.$gtype)
