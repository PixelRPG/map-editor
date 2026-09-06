import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  BUILT_IN_COMPONENT_SPECS,
  type ComponentData,
  type ComponentSpec,
  type ComponentSpecRegistry,
  type EntityDefinition,
  hiddenSettingsCount,
  isSimpleViewComponent,
  simpleViewRegistry,
} from '@pixelrpg/engine'
import { gettext as _, ngettext } from 'gettext'
import { type BespokeEditorKey, bespokeEditorKeyFor } from './bespoke-editors.model.ts'
import { ComponentInspector, type ComponentRefOptions } from './component-inspector.ts'
import { EventActionListEditor } from './event-action-list-editor.ts'

/** A per-component editor widget in the stack — the generic inspector or a bespoke one. */
type ComponentEditor = ComponentInspector | EventActionListEditor

/**
 * The bespoke editors, one factory per key `bespoke-editors.model.ts`
 * declares. Typed against that list, so adding a key without a factory
 * (or the reverse) fails the type-check rather than the user.
 */
const BESPOKE_EDITORS: Record<BespokeEditorKey, () => EventActionListEditor> = {
  'actions.actions': () => new EventActionListEditor(),
}

/**
 * The components editor for one {@link EntityDefinition}: a vertical
 * stack of {@link ComponentInspector}s (one per component, generated from
 * the registry) + an "Add component" menu of the not-yet-present types.
 * Any edit / add / remove emits `entity-changed` with the whole
 * definition as a JSON string. The host (objects / cast controller)
 * persists + broadcasts it.
 *
 * One widget, two view tiers. In **Full view** (`full-view: true`, the
 * default for a bare widget) every component renders with every field.
 * In **Simple view** the engine's disclosure rules filter what is on
 * screen — Simple-view components only, their basic fields only, the Add
 * menu trimmed to match — and what the filter trimmed is counted into
 * one "Show N more settings" row at the foot, absent when N is 0.
 * Activating that row emits `show-more-requested`; the host flips the
 * app-wide tier, so there is no per-panel state to remember. Filtering
 * is render-only: the definition is edited by index into `_components`,
 * so a hidden component survives every edit of a visible one.
 */
export class EntityComponentsEditor extends Adw.Bin {
  private _box: Gtk.Box
  private _addButton: Gtk.MenuButton
  private _moreGroup: Adw.PreferencesGroup
  private _moreRow: Adw.ButtonRow
  private _id = ''
  private _name = ''
  private _editorData: EntityDefinition['editorData']
  private _states: EntityDefinition['states']
  private _components: ComponentData[] = []
  private _refOptions: ComponentRefOptions = {}
  private _fullView = true
  /**
   * Component types a host edits through a friendlier surface of its own
   * (the Characters page's appearance + speed rows). They render no
   * group here, are not offered by the Add menu and are never counted as
   * hidden — they are on screen, just not in this widget.
   */
  private _excludedTypes: readonly string[] = []
  /**
   * Which component types this project may edit. The host injects the
   * project's EFFECTIVE registry (`effectiveComponentRegistry`), so a
   * component whose game system is switched off never appears in the Add
   * menu. The full built-in set is the fallback for hosts without a
   * project — the storybook, and any consumer outside this repo.
   */
  private _registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS
  /** Suppresses `entity-changed` while the host populates. */
  private _silent = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgEntityComponentsEditor',
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Render every component and field (true) or only the Simple-view subset (false)',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          // The whole EntityDefinition, JSON-stringified, on any change.
          'entity-changed': { param_types: [GObject.TYPE_STRING] },
          // The "Show N more settings" row was activated (Simple view only).
          'show-more-requested': {},
        },
      },
      EntityComponentsEditor,
    )
  }

  constructor() {
    super()
    this._box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18 })
    // The count row lives in its own group so it reads as the foot of the
    // component list, not as a component.
    this._moreGroup = new Adw.PreferencesGroup({ visible: false })
    this._moreRow = new Adw.ButtonRow()
    this._moreRow.set_start_icon_name('view-more-symbolic')
    this._moreRow.connect('activated', () => this.emit('show-more-requested'))
    this._moreGroup.add(this._moreRow)
    this._box.append(this._moreGroup)
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

  get fullView(): boolean {
    return this._fullView
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._rebuild()
  }

  /**
   * Set the component types this editor offers and renders — normally
   * `effectiveComponentRegistry(projectData)`. Components already on the
   * definition whose type is absent from it are left alone (dormant data
   * is preserved, never rewritten); they simply render no inspector.
   */
  setRegistry(registry: ComponentSpecRegistry): void {
    this._registry = registry
    this._rebuild()
  }

  /** Component types a host edits elsewhere; see `_excludedTypes`. */
  setExcludedTypes(types: readonly string[]): void {
    this._excludedTypes = [...types]
    this._rebuild()
  }

  /** Project-scoped picker options for the `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    for (const editor of this._componentEditors()) editor.setRefOptions(options)
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

  /** The registry as this tier offers it: trimmed to Simple-view specs, or whole. */
  private _offeredRegistry(): ComponentSpecRegistry {
    const registry = this._fullView ? this._registry : simpleViewRegistry(this._registry)
    return Object.fromEntries(Object.entries(registry).filter(([type]) => !this._excludedTypes.includes(type)))
  }

  private _componentEditors(): ComponentEditor[] {
    const out: ComponentEditor[] = []
    let child = this._box.get_first_child()
    while (child) {
      if (child instanceof ComponentInspector || child instanceof EventActionListEditor) out.push(child)
      child = child.get_next_sibling()
    }
    return out
  }

  private _rebuild(): void {
    this._silent = true
    for (const editor of this._componentEditors()) this._box.remove(editor)
    for (let i = 0; i < this._components.length; i++) {
      const editor = this._buildEditor(this._components[i], i)
      // Insert before the count row + add button (the last two children).
      if (editor) this._box.insert_child_after(editor, this._lastEditorOrNull())
    }
    this._refreshMoreRow()
    this._rebuildAddMenu()
    this._silent = false
  }

  /**
   * The editor for one component, or `null` when this tier renders none:
   * a host-excluded type, an unknown OR dormant type (no inspector
   * either way — the data stays on the definition; validation tells the
   * two apart), or a component Simple view hides.
   */
  private _buildEditor(comp: ComponentData, index: number): ComponentEditor | null {
    if (this._excludedTypes.includes(comp.type)) return null
    const spec = this._registry[comp.type]
    if (!spec) return null
    if (!this._fullView && !isSimpleViewComponent(spec)) return null

    const onDataChanged = (json: string) => {
      try {
        this._components[index] = JSON.parse(json) as ComponentData
      } catch {
        return
      }
      this._emitChange()
    }
    const bespokeKey = bespokeEditorKeyFor(spec)
    const editor = bespokeKey ? BESPOKE_EDITORS[bespokeKey]() : this._buildInspector(spec)
    editor.setRefOptions(this._refOptions)
    editor.setRemovable(true)
    editor.setData(comp)
    editor.connect('data-changed', (_w: ComponentEditor, json: string) => onDataChanged(json))
    editor.connect('remove-requested', () => this._removeComponent(index))
    return editor
  }

  private _buildInspector(spec: ComponentSpec): ComponentInspector {
    const inspector = new ComponentInspector()
    inspector.fullView = this._fullView
    inspector.setSpec(spec)
    return inspector
  }

  /** The honesty row: exact N, or nothing. Full view has nothing to reveal. */
  private _refreshMoreRow(): void {
    const count = this._fullView
      ? 0
      : hiddenSettingsCount({ components: this._components }, this._registry, this._excludedTypes)
    this._moreRow.set_title(
      ngettext('Show %d more setting', 'Show %d more settings', count).replace('%d', String(count)),
    )
    this._moreGroup.set_visible(count > 0)
  }

  private _lastEditorOrNull(): Gtk.Widget | null {
    const editors = this._componentEditors()
    return editors.length > 0 ? editors[editors.length - 1] : null
  }

  private _removeComponent(index: number): void {
    this._components.splice(index, 1)
    this._rebuild()
    this._emitChange()
  }

  /** Build the "Add component" menu of the not-yet-present offered types. */
  private _rebuildAddMenu(): void {
    const present = new Set(this._components.map((c) => c.type))
    const menu = Gio.Menu.new()
    const group = new Gio.SimpleActionGroup()
    let any = false
    for (const spec of Object.values(this._offeredRegistry())) {
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
