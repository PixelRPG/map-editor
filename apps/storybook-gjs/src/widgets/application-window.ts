import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  ControlType,
  type StoryArgValue,
  type StoryControl,
  type StoryModule,
  type StoryWidget,
} from '@pixelrpg/story-gjs'
import type { StoryRow } from '../types'
import Template from './application-window.blp'

/**
 * Main window for the Storybook application.
 *
 * Sidebar lists story instances; the preview pane holds the active
 * `StoryWidget` and an `Adw.PreferencesGroup` of controls drives its
 * `args`.
 */
export class StorybookWindow extends Adw.ApplicationWindow {
  declare _sidebar_list: Gtk.ListBox
  declare _content_area: Adw.Bin
  declare _control_panel: Adw.PreferencesGroup
  declare _preview_title: Adw.WindowTitle
  declare _show_controls_button: Gtk.ToggleButton
  declare _controls_split_view: Adw.OverlaySplitView
  declare _main_split_view: Adw.NavigationSplitView

  private _controlRows: Gtk.Widget[] = []
  private _controlRefreshers: Array<(args: Record<string, unknown>) => void> = []
  private _activeStoryHandlerId = 0
  private _activeStory: StoryWidget | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'StorybookWindow',
        Template,
        InternalChildren: [
          'sidebar_list',
          'content_area',
          'control_panel',
          'preview_title',
          'show_controls_button',
          'controls_split_view',
          'main_split_view',
        ],
      },
      StorybookWindow,
    )
  }

  constructor(params: Partial<Adw.ApplicationWindow.ConstructorProps>) {
    super(params)

    this._sidebar_list.connect('row-selected', this._onStorySelected.bind(this))
    this._show_controls_button.connect('toggled', this._onToggleControls.bind(this))
    this._controls_split_view.set_show_sidebar(true)
  }

  private _onToggleControls(button: Gtk.ToggleButton): void {
    this._controls_split_view.set_show_sidebar(button.get_active())
  }

  /** Populate sidebar with story instances grouped by category. */
  populateSidebar(storyModules: StoryModule[]): void {
    this._clearSidebar()

    if (!storyModules.some((module) => module.instances?.length)) {
      console.error('Story modules do not have instances. Call createStoryInstances first.')
      return
    }

    const categories = this._groupStoriesByCategory(storyModules)

    categories.forEach((stories, category) => {
      this._addCategoryToSidebar(category)
      stories.forEach((story) => {
        this._addStoryToSidebar(story)
      })
    })
  }

  private _clearSidebar(): void {
    let child = this._sidebar_list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      child.unparent()
      child = next
    }
  }

  private _groupStoriesByCategory(storyModules: StoryModule[]): Map<string, StoryWidget[]> {
    const categories = new Map<string, StoryWidget[]>()

    storyModules.forEach((storyModule) => {
      if (!storyModule.instances?.length) return

      storyModule.instances.forEach((storyInstance) => {
        const [category] = storyInstance.meta.title.split('/')
        if (!categories.has(category)) {
          categories.set(category, [])
        }
        categories.get(category)!.push(storyInstance)
      })
    })

    return categories
  }

  private _addCategoryToSidebar(category: string): void {
    const categoryRow = new Gtk.ListBoxRow({ selectable: false })

    const categoryLabel = new Gtk.Label({
      label: category,
      halign: Gtk.Align.START,
      margin_top: 10,
      margin_bottom: 4,
      margin_start: 12,
      margin_end: 12,
    })
    categoryLabel.add_css_class('heading')
    categoryLabel.add_css_class('dim-label')

    categoryRow.set_child(categoryLabel)
    this._sidebar_list.append(categoryRow)
  }

  private _addStoryToSidebar(story: StoryWidget): void {
    const titleParts = story.meta.title.split('/')
    const storyName = titleParts.length > 1 ? titleParts[1] : story.meta.title

    const storyRow = new Gtk.ListBoxRow() as StoryRow
    const storyLabel = new Gtk.Label({
      label: storyName || 'Unnamed Story',
      halign: Gtk.Align.START,
      margin_start: 20,
      margin_top: 6,
      margin_bottom: 6,
    })

    storyRow.set_child(storyLabel)
    this._sidebar_list.append(storyRow)
    storyRow.storyWidget = story
  }

  private _onStorySelected(_listbox: Gtk.ListBox, row: Gtk.ListBoxRow | null): void {
    if (!row) return

    const storyRow = row as StoryRow
    if (!storyRow.storyWidget) return

    this._showStory(storyRow.storyWidget)

    if (this._main_split_view.get_collapsed()) {
      this._main_split_view.set_show_content(true)
    }
  }

  private _showStory(storyWidget: StoryWidget): void {
    this._preview_title.set_title(`${storyWidget.meta.title} - ${storyWidget.story}`)
    this._content_area.set_child(storyWidget)
    this._updateControlPanel(storyWidget)
  }

  private _updateControlPanel(storyWidget: StoryWidget): void {
    this._clearControlPanel()

    const controls = storyWidget.meta.controls
    if (!Array.isArray(controls)) return

    controls.forEach((control) => {
      if (!control?.name || !control?.type) {
        console.warn('Invalid control configuration:', control)
        return
      }
      const row = this._createControlRow(storyWidget, control)
      if (row) {
        this._control_panel.add(row)
        this._controlRows.push(row)
      }
    })

    // Subscribe to the story's `args` so external mutations (e.g. a
    // layer-row's lock toggle clicked directly in the preview) drive a
    // refresh of every control widget.
    if (this._activeStory && this._activeStoryHandlerId) {
      this._activeStory.disconnect(this._activeStoryHandlerId)
    }
    this._activeStory = storyWidget
    this._activeStoryHandlerId = storyWidget.connect('notify::args', () => {
      for (const refresh of this._controlRefreshers) refresh(storyWidget.args)
    })

    this._show_controls_button.set_active(true)
  }

  private _clearControlPanel(): void {
    for (const row of this._controlRows) {
      this._control_panel.remove(row)
    }
    this._controlRows = []
    this._controlRefreshers = []
  }

  private _createControlRow(storyWidget: StoryWidget, controlConfig: StoryControl): Gtk.Widget | null {
    const currentValue = storyWidget.args[controlConfig.name]

    switch (controlConfig.type) {
      case ControlType.TEXT:
        return this._createTextRow(storyWidget, controlConfig, typeof currentValue === 'string' ? currentValue : '')

      case ControlType.NUMBER:
        return this._createNumberRow(
          storyWidget,
          controlConfig,
          typeof currentValue === 'number' ? currentValue : (controlConfig.min ?? 0),
        )

      case ControlType.BOOLEAN:
        return this._createBooleanRow(
          storyWidget,
          controlConfig,
          typeof currentValue === 'boolean' ? currentValue : false,
        )

      case ControlType.RANGE:
        return this._createRangeRow(
          storyWidget,
          controlConfig,
          typeof currentValue === 'number' ? currentValue : (controlConfig.min ?? 0),
        )

      case ControlType.SELECT:
        return this._createSelectRow(storyWidget, controlConfig, currentValue ?? null)

      case ControlType.COLOR:
        return this._createColorRow(
          storyWidget,
          controlConfig,
          typeof currentValue === 'string' ? currentValue : '#000000',
        )

      default:
        console.warn(`Unsupported control type: ${controlConfig.type}`)
        return null
    }
  }

  private _writeArg(storyWidget: StoryWidget, name: string, value: StoryArgValue): void {
    storyWidget.args = { ...storyWidget.args, [name]: value }
  }

  private _createTextRow(storyWidget: StoryWidget, config: StoryControl, current: string): Adw.EntryRow {
    const row = new Adw.EntryRow({ title: config.label || config.name })
    row.set_text(current)
    if (config.description) row.set_tooltip_text(config.description)
    row.connect('changed', () => this._writeArg(storyWidget, config.name, row.get_text()))
    this._controlRefreshers.push((args) => {
      const next = typeof args[config.name] === 'string' ? (args[config.name] as string) : ''
      if (row.get_text() !== next) row.set_text(next)
    })
    return row
  }

  private _createNumberRow(storyWidget: StoryWidget, config: StoryControl, current: number): Adw.SpinRow {
    const row = Adw.SpinRow.new_with_range(config.min ?? 0, config.max ?? 100, config.step ?? 1)
    row.set_title(config.label || config.name)
    if (config.description) row.set_subtitle(config.description)
    row.set_value(current)
    row.connect('changed', () => this._writeArg(storyWidget, config.name, row.get_value()))
    this._controlRefreshers.push((args) => {
      const next = typeof args[config.name] === 'number' ? (args[config.name] as number) : 0
      if (row.get_value() !== next) row.set_value(next)
    })
    return row
  }

  private _createBooleanRow(storyWidget: StoryWidget, config: StoryControl, current: boolean): Adw.SwitchRow {
    const row = new Adw.SwitchRow({
      title: config.label || config.name,
      subtitle: config.description ?? '',
      active: current,
    })
    row.connect('notify::active', () => this._writeArg(storyWidget, config.name, row.get_active()))
    this._controlRefreshers.push((args) => {
      const next = Boolean(args[config.name])
      if (row.get_active() !== next) row.set_active(next)
    })
    return row
  }

  private _createRangeRow(storyWidget: StoryWidget, config: StoryControl, current: number): Gtk.Widget {
    const min = config.min ?? 0
    const max = config.max ?? 100
    const step = config.step ?? 1
    const shouldRound = Number.isInteger(step) && Number.isInteger(current)

    const adjustment = new Gtk.Adjustment({
      lower: min,
      upper: max,
      step_increment: step,
      value: current,
    })
    adjustment.step_increment = step

    // Vertical card so the label + description don't get squashed into
    // a single-letter column when the controls sidebar is narrow.
    const row = new Gtk.ListBoxRow({ selectable: false, activatable: false })
    row.add_css_class('story-range-row')

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    })

    const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 })
    const titleLabel = new Gtk.Label({
      label: config.label || config.name,
      halign: Gtk.Align.START,
      hexpand: true,
      ellipsize: 3, // PANGO_ELLIPSIZE_END
    })
    titleLabel.add_css_class('heading')

    const valueLabel = new Gtk.Label({
      label: this._formatRangeValue(current, shouldRound),
      halign: Gtk.Align.END,
    })
    valueLabel.add_css_class('numeric')
    valueLabel.add_css_class('dim-label')

    header.append(titleLabel)
    header.append(valueLabel)
    box.append(header)

    if (config.description) {
      const desc = new Gtk.Label({
        label: config.description,
        halign: Gtk.Align.START,
        xalign: 0,
        wrap: true,
        max_width_chars: 32,
      })
      desc.add_css_class('caption')
      desc.add_css_class('dim-label')
      box.append(desc)
    }

    const scale = new Gtk.Scale({
      orientation: Gtk.Orientation.HORIZONTAL,
      adjustment,
      draw_value: false,
      hexpand: true,
    })

    scale.connect('value-changed', () => {
      let value = scale.get_value()
      if (shouldRound) {
        const rounded = Math.round(value)
        if (rounded !== value) {
          scale.set_value(rounded)
          return
        }
        value = rounded
      }
      valueLabel.set_label(this._formatRangeValue(value, shouldRound))
      this._writeArg(storyWidget, config.name, value)
    })

    box.append(scale)
    row.set_child(box)

    this._controlRefreshers.push((args) => {
      const value = typeof args[config.name] === 'number' ? (args[config.name] as number) : current
      if (scale.get_value() !== value) {
        scale.set_value(value)
        valueLabel.set_label(this._formatRangeValue(value, shouldRound))
      }
    })
    return row
  }

  private _formatRangeValue(value: number, asInteger: boolean): string {
    return asInteger ? String(Math.round(value)) : value.toFixed(2)
  }

  private _createSelectRow(
    storyWidget: StoryWidget,
    config: StoryControl,
    current: StoryArgValue,
  ): Adw.ComboRow | null {
    const options = config.options
    if (!options?.length) {
      console.warn(`SELECT control "${config.name}" has no options`)
      return null
    }

    const model = Gtk.StringList.new(options.map((opt) => opt.label))
    const row = new Adw.ComboRow({
      title: config.label || config.name,
      subtitle: config.description ?? '',
      model,
    })

    const selected = options.findIndex((opt) => opt.value === current)
    if (selected >= 0) row.set_selected(selected)

    row.connect('notify::selected', () => {
      const idx = row.get_selected()
      if (idx >= 0 && idx < options.length) {
        this._writeArg(storyWidget, config.name, options[idx].value)
      }
    })

    this._controlRefreshers.push((args) => {
      const value = args[config.name]
      const idx = options.findIndex((opt) => opt.value === value)
      if (idx >= 0 && row.get_selected() !== idx) row.set_selected(idx)
    })

    return row
  }

  private _createColorRow(storyWidget: StoryWidget, config: StoryControl, current: string): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: config.label || config.name,
      subtitle: config.description ?? '',
    })

    const button = new Gtk.ColorDialogButton({
      dialog: new Gtk.ColorDialog({ title: config.label || config.name }),
      valign: Gtk.Align.CENTER,
    })

    const initial = new Gdk.RGBA()
    if (initial.parse(current)) {
      button.set_rgba(initial)
    }

    button.connect('notify::rgba', () => {
      this._writeArg(storyWidget, config.name, this._rgbaToHex(button.get_rgba()))
    })

    row.add_suffix(button)
    row.set_activatable_widget(button)
    return row
  }

  private _rgbaToHex(rgba: Gdk.RGBA): string {
    const channel = (v: number) =>
      Math.round(Math.max(0, Math.min(1, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    return `#${channel(rgba.red)}${channel(rgba.green)}${channel(rgba.blue)}`
  }
}

GObject.type_ensure(StorybookWindow.$gtype)
