import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  type ComponentData,
  type ComponentSpec,
  type FieldDescriptor,
  type FieldOption,
  simpleViewFields,
} from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import {
  defaultComponentData,
  overlayRenderedFields,
  rowKindFor,
  spinGeometryFor,
  spinValueFor,
} from './component-inspector.model.ts'
import { presentReferencePicker } from './reference-picker.ts'

/** Project-scoped options injected by the host for the `*-ref` field pickers. */
export interface ComponentRefOptions {
  maps?: ReadonlyArray<{ value: string; label: string }>
  appearances?: ReadonlyArray<{ value: string; label: string }>
  spriteSets?: ReadonlyArray<{ value: string; label: string }>
}

/** The four directions a `facing` field can hold; labels are msgids. */
const FACING_OPTIONS: readonly FieldOption[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

/** One option with its msgid label translated. */
const translated = (option: FieldOption): FieldOption => ({ value: option.value, label: _(option.label) })

/**
 * Icon standing in for a referenced thing's picture in a reference row.
 * {@link ComponentRefOptions} carries labels only, so there is nothing
 * truer to draw yet — see TODO.md § Library.
 */
const REF_ICONS: Record<string, string> = {
  'map-ref': 'map-symbolic',
  'appearance-ref': 'image-x-generic-symbolic',
  'sprite-ref': 'image-x-generic-symbolic',
}

/** One generated row: its descriptor + read/write accessors over the live widget. */
interface FieldRow {
  field: FieldDescriptor
  get: () => unknown
  set: (value: unknown) => void
}

/**
 * Typed view of the signals {@link ComponentInspector} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface ComponentInspectorSignals extends Adw.PreferencesGroup.SignalSignatures {
  'data-changed': (dataJson: string) => void
  'remove-requested': () => void
}

/**
 * Inspector for ONE component — an `Adw.PreferencesGroup` whose rows are
 * **generated from the component spec's {@link FieldDescriptor}s** (no
 * hand-built template). Each `input` maps to an Adwaita row; edits emit
 * `data-changed` with the whole {@link ComponentData} as a JSON string
 * (GObject param-friendly + wholesale-replace semantics). A header remove
 * button emits `remove-requested`.
 *
 * The host (`EntityComponentsEditor` / the objects + cast controllers)
 * supplies `setSpec` + `setData` + `setRefOptions` and applies the
 * resulting `data-changed`.
 */
export class ComponentInspector extends Adw.PreferencesGroup {
  private _spec: ComponentSpec | null = null
  private _refOptions: ComponentRefOptions = {}
  private _fullView = true
  private _rows: FieldRow[] = []
  private _trackedRows: Adw.PreferencesRow[] = []
  /**
   * The last payload the host set (or this widget emitted). Every edit
   * overlays the rendered rows onto it, so a field no row renders is
   * never dropped — see `overlayRenderedFields`.
   */
  private _data: ComponentData | null = null
  /** Suppresses `data-changed` while the host populates rows. */
  private _silent = false
  private _headerMenu: Gtk.MenuButton | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgComponentInspector',
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Render every field (true) or only the basic ones (false)',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          // The whole component data, JSON-stringified, on any edit.
          'data-changed': { param_types: [GObject.TYPE_STRING] },
          // The header remove (✕) was clicked.
          'remove-requested': {},
          // Whether this component can be removed (false for required ones).
        },
      },
      ComponentInspector,
    )
  }

  declare connect: GObject.SignalMethods<this, ComponentInspectorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, ComponentInspectorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, ComponentInspectorSignals>['emit']

  get fullView(): boolean {
    return this._fullView
  }

  /**
   * Which tier renders: Full view shows every field, Simple view only the
   * `basic` ones and never a raw `json` row. Render-only — `setData`'s
   * payload is kept whole either way.
   */
  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    if (this._spec) this._rebuild()
  }

  /**
   * Show / hide the header suffix menu (REDESIGN § 4.4: "Full view gets a
   * component header suffix menu (Remove, Reset)").
   *
   * It replaced a bare trash button, which offered the destructive half
   * of the pair only and offered it one slip of the finger away.
   */
  setRemovable(removable: boolean): void {
    if (removable && !this._headerMenu) {
      this._headerMenu = this._buildHeaderMenu()
      this.set_header_suffix(this._headerMenu)
    } else if (!removable && this._headerMenu) {
      this.set_header_suffix(null)
      this._headerMenu = null
    }
  }

  /**
   * The "⋯" menu. Its two items ride a `component` action group inserted
   * on this widget rather than window actions: several inspectors are on
   * screen at once, so "remove" has to mean *this* component — which a
   * group scoped to the widget resolves for free, and a window action
   * would need a target for.
   */
  private _buildHeaderMenu(): Gtk.MenuButton {
    const actions = new Gio.SimpleActionGroup()

    const reset = new Gio.SimpleAction({ name: 'reset' })
    reset.connect('activate', () => this._resetToDefaults())
    actions.add_action(reset)

    const remove = new Gio.SimpleAction({ name: 'remove' })
    remove.connect('activate', () => this.emit('remove-requested'))
    actions.add_action(remove)

    this.insert_action_group('component', actions)

    const menu = new Gio.Menu()
    menu.append(_('Reset to defaults'), 'component.reset')
    menu.append(_('Remove'), 'component.remove')

    return new Gtk.MenuButton({
      iconName: 'view-more-symbolic',
      menuModel: menu,
      tooltipText: _('Component options'),
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
    })
  }

  /**
   * Put every field back to its spec default and tell the host, so a
   * component mangled past recognition can be recovered without removing
   * and re-adding it.
   */
  private _resetToDefaults(): void {
    if (!this._spec) return
    this._data = defaultComponentData(this._spec)
    this._applyData()
    this.emit('data-changed', JSON.stringify(this._data))
  }

  /** Project-scoped options for the `*-ref` pickers; rebuilds if a spec is set. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    if (this._spec) this._rebuild()
  }

  /** Set the component spec (title + which rows to render). */
  setSpec(spec: ComponentSpec): void {
    this._spec = spec
    this.set_title(_(spec.editor.label))
    this._rebuild()
  }

  /** Populate the rows from component data without echoing `data-changed`. */
  setData(data: ComponentData): void {
    this._data = { ...data }
    this._applyData()
  }

  private _applyData(): void {
    const data = this._data
    if (!data) return
    this._silent = true
    try {
      for (const row of this._rows) row.set(data[row.field.key])
    } finally {
      this._silent = false
    }
  }

  private _rebuild(): void {
    this._clearRows()
    this._rows = []
    if (!this._spec) return
    for (const field of this._renderedFields(this._spec)) {
      this._rows.push(this._buildRow(field))
    }
    // A rebuild after `setData` (new ref options, a filter change) must
    // show the data, not the descriptors' defaults.
    this._applyData()
  }

  /** The descriptors this tier renders (see the engine's disclosure rules). */
  private _renderedFields(spec: ComponentSpec): readonly FieldDescriptor[] {
    if (this._fullView) return spec.fields
    return simpleViewFields(spec).filter((field) => field.input !== 'json')
  }

  private _clearRows(): void {
    for (const r of this._trackedRows) this.remove(r)
    this._trackedRows = []
  }

  /**
   * Build the one row a field asks for. WHICH row is not decided here —
   * `rowKindFor` owns that, and is unit-tested without a display; this
   * method only knows how to assemble each kind.
   */
  private _buildRow(field: FieldDescriptor): FieldRow {
    const label = _(field.label)
    const options = this._optionsFor(field)
    const onEdit = () => {
      if (!this._silent) this._emitChange()
    }
    switch (rowKindFor(field, options.length)) {
      case 'spin':
        return this._buildSpinRow(field, label, onEdit)
      case 'switch':
        return this._buildSwitchRow(field, label, onEdit)
      case 'toggle-group':
        return this._buildToggleRow(field, label, options, onEdit)
      case 'combo':
        return this._buildComboRow(field, label, options, onEdit)
      case 'reference':
        return this._buildReferenceRow(field, label, options, onEdit)
      case 'json':
        return this._buildJsonRow(field, label, onEdit)
      default:
        return this._buildEntryRow(field, label, onEdit)
    }
  }

  private _buildSpinRow(field: FieldDescriptor, label: string, onEdit: () => void): FieldRow {
    const geometry = spinGeometryFor(field)
    const adjustment = new Gtk.Adjustment({
      lower: geometry.lower,
      upper: geometry.upper,
      stepIncrement: geometry.step,
      pageIncrement: geometry.step * 10,
      value: spinValueFor(field, undefined),
    })
    const row = new Adw.SpinRow({ title: label, adjustment, digits: geometry.digits })
    row.connect('notify::value', onEdit)
    this._appendRow(row)
    return {
      field,
      get: () => (field.input === 'int' ? Math.round(row.get_value()) : row.get_value()),
      set: (v) => row.set_value(spinValueFor(field, v)),
    }
  }

  private _buildSwitchRow(field: FieldDescriptor, label: string, onEdit: () => void): FieldRow {
    const row = new Adw.SwitchRow({ title: label, active: field.default === true })
    row.connect('notify::active', onEdit)
    this._appendRow(row)
    return { field, get: () => row.get_active(), set: (v) => row.set_active(v === true) }
  }

  /**
   * A short enum as inline segments: at four choices or fewer every label
   * is readable at a glance and one tap away, where a `ComboRow` hides
   * them all behind a popover.
   */
  private _buildToggleRow(
    field: FieldDescriptor,
    label: string,
    options: readonly FieldOption[],
    onEdit: () => void,
  ): FieldRow {
    const group = new Adw.ToggleGroup({ canShrink: true, valign: Gtk.Align.CENTER })
    for (const option of options) {
      group.add(new Adw.Toggle({ name: option.value, label: option.label }))
    }
    const fallback = typeof field.default === 'string' ? field.default : options[0]?.value
    if (fallback !== undefined) group.set_active_name(fallback)
    // Connected after the toggles are in: `add` moves `active` onto the
    // first one, which is setup rather than an edit.
    group.connect('notify::active-name', onEdit)

    const row = new Adw.ActionRow({ title: label, activatableWidget: group })
    row.add_suffix(group)
    this._appendRow(row)
    return {
      field,
      get: () => group.get_active_name() ?? undefined,
      set: (v) => {
        const value = typeof v === 'string' && options.some((o) => o.value === v) ? v : fallback
        group.set_active_name(value ?? null)
      },
    }
  }

  private _buildComboRow(
    field: FieldDescriptor,
    label: string,
    options: readonly FieldOption[],
    onEdit: () => void,
  ): FieldRow {
    const values = options.map((o) => o.value)
    const model = Gtk.StringList.new(options.map((o) => o.label))
    const row = new Adw.ComboRow({ title: label, model })
    row.connect('notify::selected', onEdit)
    this._appendRow(row)
    return {
      field,
      get: () => {
        const i = row.get_selected()
        return i >= 0 && i < values.length ? values[i] : undefined
      },
      set: (v) => {
        const i = typeof v === 'string' ? values.indexOf(v) : -1
        if (i >= 0) row.set_selected(i)
      },
    }
  }

  /**
   * A pointer at another thing in the project: picture, the thing's name,
   * and a tap that opens the picker. The id itself is never shown unless
   * it resolves to nothing — then it IS the honest answer, because the
   * alternative is an empty row for data that is set but dangling.
   */
  private _buildReferenceRow(
    field: FieldDescriptor,
    label: string,
    options: readonly FieldOption[],
    onEdit: () => void,
  ): FieldRow {
    const icon = REF_ICONS[field.input] ?? 'image-x-generic-symbolic'
    let current = typeof field.default === 'string' ? field.default : ''

    const thumbnail = new Gtk.Image({ iconName: icon, pixelSize: 24, valign: Gtk.Align.CENTER })
    const row = new Adw.ActionRow({ title: label, activatable: true })
    row.add_prefix(thumbnail)
    row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', valign: Gtk.Align.CENTER }))

    const render = () => {
      const match = options.find((o) => o.value === current)
      row.set_subtitle(match?.label ?? current)
      thumbnail.visible = current !== ''
    }
    render()

    row.connect('activated', () => {
      presentReferencePicker(this, { title: label, options, selected: current, icon }, (value) => {
        if (value === current) return
        current = value
        render()
        onEdit()
      })
    })
    this._appendRow(row)
    return {
      field,
      get: () => current || undefined,
      set: (v) => {
        current = typeof v === 'string' ? v : ''
        render()
      },
    }
  }

  /** Raw JSON for data the flat field DSL can't describe; parses on read. */
  private _buildJsonRow(field: FieldDescriptor, label: string, onEdit: () => void): FieldRow {
    const row = new Adw.EntryRow({ title: label })
    row.connect('changed', onEdit)
    this._appendRow(row)
    return {
      field,
      get: () => {
        const text = row.get_text().trim()
        if (!text) return undefined
        try {
          return JSON.parse(text)
        } catch {
          return undefined // invalid JSON → omit (host validation flags it)
        }
      },
      set: (v) => row.set_text(v === undefined ? '' : JSON.stringify(v)),
    }
  }

  private _buildEntryRow(field: FieldDescriptor, label: string, onEdit: () => void): FieldRow {
    const row = new Adw.EntryRow({ title: label })
    row.connect('changed', onEdit)
    this._appendRow(row)
    return {
      field,
      get: () => row.get_text() || undefined,
      set: (v) => row.set_text(typeof v === 'string' ? v : ''),
    }
  }

  private _appendRow(row: Adw.PreferencesRow): void {
    this.add(row)
    this._trackedRows.push(row)
  }

  /**
   * Options for a select/ref field, with labels ready to DISPLAY — every
   * caller renders them, so translating once here beats each row builder
   * remembering to, and remembering which half to leave alone.
   *
   * Which half: a built-in label (the `facing` directions, a spec's
   * `field.options`) is a msgid and gets `_()`; a map / appearance /
   * sprite-set name is the user's own text and is passed through, because
   * `_()` on user data returns a hit from the catalogue for anything that
   * happens to collide with a msgid.
   *
   * `*-ref` lists get a leading "(None)" sentinel (value `''`) so an unset
   * reference shows honestly + maps back to empty — without it the row
   * would silently display the first option for a value it has not got.
   */
  private _optionsFor(field: FieldDescriptor): readonly FieldOption[] {
    const none: FieldOption = { value: '', label: _('(None)') }
    switch (field.input) {
      case 'facing':
        return FACING_OPTIONS.map(translated)
      case 'map-ref':
        return [none, ...(this._refOptions.maps ?? [])]
      case 'appearance-ref':
      case 'sprite-ref':
        return [none, ...(this._refOptions.appearances ?? this._refOptions.spriteSets ?? [])]
      default:
        return (field.options ?? []).map(translated)
    }
  }

  /**
   * Overlay the rendered rows onto the last payload + emit the result.
   * Starting from the payload rather than from the rows is what keeps a
   * field that is not on screen from being silently dropped.
   */
  private _emitChange(): void {
    if (!this._spec) return
    const rendered = this._rows.map((row) => ({ key: row.field.key, value: row.get() }))
    const data = overlayRenderedFields(this._spec.type, this._data, rendered)
    this._data = data
    this.emit('data-changed', JSON.stringify(data))
  }
}

GObject.type_ensure(ComponentInspector.$gtype)
