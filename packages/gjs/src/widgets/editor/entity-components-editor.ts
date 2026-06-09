import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  BUILT_IN_COMPONENT_SPECS,
  type ComponentData,
  type ComponentSpec,
  type EntityDefinition,
} from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { ComponentInspector, type ComponentRefOptions } from './component-inspector.ts'

/**
 * The advanced "all components" editor for one {@link EntityDefinition}: a
 * vertical stack of {@link ComponentInspector}s (one per component,
 * generated from the registry) + an "Add component" menu of the
 * not-yet-present types. Any edit / add / remove emits `entity-changed`
 * with the whole definition as a JSON string. The host (objects / cast
 * controller) persists + broadcasts it.
 *
 * This is the progressive-disclosure power surface; the friendly Cast /
 * template inspectors edit the same definition through a simpler view.
 */
export class EntityComponentsEditor extends Adw.Bin {
  private _box: Gtk.Box
  private _addButton: Gtk.MenuButton
  private _id = ''
  private _name = ''
  private _editorData: EntityDefinition['editorData']
  private _states: EntityDefinition['states']
  private _components: ComponentData[] = []
  private _refOptions: ComponentRefOptions = {}
  /** Suppresses `entity-changed` while the host populates. */
  private _silent = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgEntityComponentsEditor',
        Signals: {
          // The whole EntityDefinition, JSON-stringified, on any change.
          'entity-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      EntityComponentsEditor,
    )
  }

  constructor() {
    super()
    this._box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18 })
    this._addButton = new Gtk.MenuButton({
      label: _('Add component'),
      iconName: 'list-add-symbolic',
      alwaysShowArrow: true,
      cssClasses: ['flat'],
      halign: Gtk.Align.START,
    })
    this._box.append(this._addButton)
    this.set_child(this._box)
  }

  /** Project-scoped picker options for the `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    for (const inspector of this._inspectors()) inspector.setRefOptions(options)
  }

  /** Populate from an entity definition (no `entity-changed` echo). */
  setEntity(def: EntityDefinition): void {
    this._id = def.id
    this._name = def.name
    this._editorData = def.editorData
    this._states = def.states
    this._components = def.components.map((c) => ({ ...c }))
    this._rebuild()
  }

  private _inspectors(): ComponentInspector[] {
    const out: ComponentInspector[] = []
    let child = this._box.get_first_child()
    while (child) {
      if (child instanceof ComponentInspector) out.push(child)
      child = child.get_next_sibling()
    }
    return out
  }

  private _rebuild(): void {
    this._silent = true
    for (const inspector of this._inspectors()) this._box.remove(inspector)
    for (let i = 0; i < this._components.length; i++) {
      const comp = this._components[i]
      const spec = BUILT_IN_COMPONENT_SPECS[comp.type]
      if (!spec) continue // unknown type — skip (validation flags it elsewhere)
      const inspector = new ComponentInspector()
      inspector.setSpec(spec)
      inspector.setRefOptions(this._refOptions)
      inspector.setRemovable(true)
      inspector.setData(comp)
      const index = i
      inspector.connect('data-changed', (_w: ComponentInspector, json: string) => {
        try {
          this._components[index] = JSON.parse(json) as ComponentData
        } catch {
          return
        }
        this._emitChange()
      })
      inspector.connect('remove-requested', () => this._removeComponent(index))
      // Insert before the add button (which is the last child).
      this._box.insert_child_after(inspector, this._lastInspectorOrNull())
    }
    this._rebuildAddMenu()
    this._silent = false
  }

  private _lastInspectorOrNull(): Gtk.Widget | null {
    const inspectors = this._inspectors()
    return inspectors.length > 0 ? inspectors[inspectors.length - 1] : null
  }

  private _removeComponent(index: number): void {
    this._components.splice(index, 1)
    this._rebuild()
    this._emitChange()
  }

  /** Build the "Add component" menu of the not-yet-present registry types. */
  private _rebuildAddMenu(): void {
    const present = new Set(this._components.map((c) => c.type))
    const menu = Gio.Menu.new()
    const group = new Gio.SimpleActionGroup()
    let any = false
    for (const spec of Object.values(BUILT_IN_COMPONENT_SPECS) as ComponentSpec[]) {
      if (present.has(spec.type)) continue
      any = true
      const actionName = `add-${spec.type}`
      const action = new Gio.SimpleAction({ name: actionName })
      action.connect('activate', () => this._addComponent(spec))
      group.add_action(action)
      menu.append(_(spec.editor.label), `add.${actionName}`)
    }
    this._addButton.set_menu_model(menu)
    this._addButton.insert_action_group('add', group)
    this._addButton.set_sensitive(any)
  }

  private _addComponent(spec: ComponentSpec): void {
    const data: ComponentData = { type: spec.type }
    for (const field of spec.fields) {
      if (field.default !== undefined) data[field.key] = field.default
    }
    this._components.push(data)
    this._rebuild()
    this._emitChange()
  }

  private _emitChange(): void {
    if (this._silent) return
    const def: EntityDefinition = {
      id: this._id,
      name: this._name,
      components: this._components,
      ...(this._states ? { states: this._states } : {}),
      ...(this._editorData ? { editorData: this._editorData } : {}),
    }
    this.emit('entity-changed', JSON.stringify(def))
  }
}

GObject.type_ensure(EntityComponentsEditor.$gtype)
