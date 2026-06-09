import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { ComponentData, ComponentSpec, FieldDescriptor } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

/** Project-scoped options injected by the host for the `*-ref` field pickers. */
export interface ComponentRefOptions {
  maps?: ReadonlyArray<{ value: string; label: string }>
  appearances?: ReadonlyArray<{ value: string; label: string }>
  spriteSets?: ReadonlyArray<{ value: string; label: string }>
}

const FACING_OPTIONS = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

/** One generated row: its descriptor + read/write accessors over the live widget. */
interface FieldRow {
  field: FieldDescriptor
  get: () => unknown
  set: (value: unknown) => void
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
  private _rows: FieldRow[] = []
  private _trackedRows: Adw.PreferencesRow[] = []
  /** Suppresses `data-changed` while the host populates rows. */
  private _silent = false
  private _removeButton: Gtk.Button | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgComponentInspector',
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

  /** Show / hide the header remove (✕) button. */
  setRemovable(removable: boolean): void {
    if (removable && !this._removeButton) {
      const btn = new Gtk.Button({
        iconName: 'user-trash-symbolic',
        tooltipText: _('Remove component'),
        cssClasses: ['flat'],
        valign: Gtk.Align.CENTER,
      })
      btn.connect('clicked', () => this.emit('remove-requested'))
      this._removeButton = btn
      this.set_header_suffix(btn)
    } else if (!removable && this._removeButton) {
      this.set_header_suffix(null)
      this._removeButton = null
    }
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
    for (const field of this._spec.fields) {
      this._rows.push(this._buildRow(field))
    }
  }

  private _clearRows(): void {
    for (const r of this._trackedRows) this.remove(r)
    this._trackedRows = []
  }

  private _buildRow(field: FieldDescriptor): FieldRow {
    const label = _(field.label)
    const onEdit = () => {
      if (!this._silent) this._emitChange()
    }
    switch (field.input) {
      case 'int':
      case 'float': {
        const adjustment = new Gtk.Adjustment({
          lower: field.min ?? 0,
          upper: field.max ?? 100000,
          stepIncrement: field.step ?? (field.input === 'int' ? 1 : 0.5),
          value: typeof field.default === 'number' ? field.default : (field.min ?? 0),
        })
        const row = new Adw.SpinRow({ title: label, adjustment, digits: field.input === 'float' ? 2 : 0 })
        row.connect('notify::value', onEdit)
        this._appendRow(row)
        return {
          field,
          get: () => (field.input === 'int' ? Math.round(row.get_value()) : row.get_value()),
          set: (v) => row.set_value(typeof v === 'number' ? v : (field.min ?? 0)),
        }
      }
      case 'bool': {
        const row = new Adw.SwitchRow({ title: label, active: field.default === true })
        row.connect('notify::active', onEdit)
        this._appendRow(row)
        return { field, get: () => row.get_active(), set: (v) => row.set_active(v === true) }
      }
      case 'select':
      case 'facing':
      case 'map-ref':
      case 'appearance-ref':
      case 'sprite-ref': {
        const options = this._optionsFor(field)
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
      default: {
        // text / map-ref fallback / json → an EntryRow. `json` parses on read.
        const row = new Adw.EntryRow({ title: label })
        row.connect('changed', onEdit)
        this._appendRow(row)
        if (field.input === 'json') {
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
        return {
          field,
          get: () => row.get_text() || undefined,
          set: (v) => row.set_text(typeof v === 'string' ? v : ''),
        }
      }
    }
  }

  private _appendRow(row: Adw.PreferencesRow): void {
    this.add(row)
    this._trackedRows.push(row)
  }

  /** Options for a select/ref field — from the descriptor or the injected refs. */
  private _optionsFor(field: FieldDescriptor): ReadonlyArray<{ value: string; label: string }> {
    switch (field.input) {
      case 'facing':
        return FACING_OPTIONS
      case 'map-ref':
        return this._refOptions.maps ?? []
      case 'appearance-ref':
      case 'sprite-ref':
        return this._refOptions.appearances ?? this._refOptions.spriteSets ?? []
      default:
        return field.options ?? []
    }
  }

  /** Re-assemble the component data from the rows + emit it. */
  private _emitChange(): void {
    if (!this._spec) return
    const data: ComponentData = { type: this._spec.type }
    for (const row of this._rows) {
      const value = row.get()
      if (value !== undefined) data[row.field.key] = value
    }
    this.emit('data-changed', JSON.stringify(data))
  }
}

GObject.type_ensure(ComponentInspector.$gtype)
