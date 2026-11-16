import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
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
import { presentAddComponentDialog } from './add-component-dialog.ts'
import { type BespokeEditorKey, bespokeEditorKeyFor } from './bespoke-editors.model.ts'
import { defaultComponentData } from './component-inspector.model.ts'
import { ComponentInspector, type ComponentRefOptions } from './component-inspector.ts'
import {
  type AddableComponentGroup,
  addableComponentGroups,
  type DormantComponentFacts,
  dormantComponentFacts,
} from './entity-components-editor.model.ts'
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
 * Typed view of the signals {@link EntityComponentsEditor} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface EntityComponentsEditorSignals extends Adw.Bin.SignalSignatures {
  'entity-changed': (entityJson: string) => void
  'show-more-requested': () => void
}

/**
 * The components editor for one {@link EntityDefinition}: a vertical
 * stack of {@link ComponentInspector}s (one per component, generated from
 * the registry) + an "Add an ability" row opening a chooser of the
 * not-yet-present types, grouped by the game system that owns them.
 * Any edit / add / remove emits `entity-changed` with the whole
 * definition as a JSON string. The host (objects / cast controller)
 * persists + broadcasts it.
 *
 * One widget, two view tiers. In **Full view** (`full-view: true`, the
 * default for a bare widget) every component renders with every field.
 * In **Simple view** the engine's disclosure rules filter what is on
 * screen — Simple-view components only, their basic fields only, the Add
 * chooser trimmed to match — and what the filter trimmed is counted into
 * one "Show N more settings" row at the foot, absent when N is 0.
 * Activating that row emits `show-more-requested`; the host flips the
 * app-wide tier, so there is no per-panel state to remember. Filtering
 * is render-only: the definition is edited by index into `_components`,
 * so a hidden component survives every edit of a visible one.
 */
export class EntityComponentsEditor extends Adw.Bin {
  private _box: Gtk.Box
  private _addGroup: Adw.PreferencesGroup
  private _addRow: Adw.ButtonRow
  private _moreGroup: Adw.PreferencesGroup
  private _moreRow: Adw.ButtonRow
  /**
   * The per-component children this widget put in the box, in box order.
   *
   * Tracked rather than rediscovered by `instanceof`: a component can
   * render as an editor OR as a dormant {@link Adw.PreferencesGroup},
   * and the group is indistinguishable by type from the two permanent
   * ones around it.
   */
  private _rendered: Gtk.Widget[] = []
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
   * Component types that render but cannot be removed here. The
   * placement inspector sets this to the types the BASE definition
   * carries: the per-placement override model replaces wholesale per
   * `type` and has no tombstone, so "removing" a base component would
   * silently let the library's value show through again. Only the types
   * the placement itself added are removable.
   *
   * Unlike `_excludedTypes` these still count as present — they are
   * editable, just not deletable.
   */
  private _nonRemovableTypes: readonly string[] = []
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

  declare connect: GObject.SignalMethods<this, EntityComponentsEditorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, EntityComponentsEditorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, EntityComponentsEditorSignals>['emit']

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
    this._addGroup = new Adw.PreferencesGroup()
    this._addRow = new Adw.ButtonRow({ title: _('Add an ability') })
    this._addRow.set_start_icon_name('list-add-symbolic')
    this._addRow.connect('activated', () => this._presentAddDialog())
    this._addGroup.add(this._addRow)
    this._box.append(this._addGroup)
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

  /** Component types whose group hides its remove button; see `_nonRemovableTypes`. */
  setNonRemovableTypes(types: readonly string[]): void {
    this._nonRemovableTypes = [...types]
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
    return this._rendered.filter(
      (child): child is ComponentEditor =>
        child instanceof ComponentInspector || child instanceof EventActionListEditor,
    )
  }

  private _rebuild(): void {
    this._silent = true
    for (const child of this._rendered) this._box.remove(child)
    this._rendered = []
    for (let i = 0; i < this._components.length; i++) {
      const child = this._buildRow(this._components[i], i)
      if (!child) continue
      // Insert before the count row + add row (the last two children).
      this._box.insert_child_after(child, this._lastRenderedOrNull())
      this._rendered.push(child)
    }
    this._refreshMoreRow()
    this._refreshAddRow()
    this._silent = false
  }

  /**
   * What one component renders as, or `null` for nothing at all: a
   * host-excluded type, a component Simple view hides, or an UNKNOWN
   * type (the data stays on the definition and validation reports it —
   * there is nothing this widget can honestly offer).
   *
   * A type this build knows but the project switched OFF renders the
   * dormant group instead of an editor, in both tiers: "your settings
   * are still here" is the same honesty as the "Show N more settings"
   * row, and hiding it in Simple view would leave a child wondering why
   * an ability they gave a thing does nothing.
   */
  private _buildRow(comp: ComponentData, index: number): Gtk.Widget | null {
    if (this._excludedTypes.includes(comp.type)) return null
    const spec = this._registry[comp.type]
    if (!spec) {
      const facts = dormantComponentFacts(comp.type, this._registry)
      return facts ? this._buildDormantGroup(facts) : null
    }
    if (!this._fullView && !isSimpleViewComponent(spec)) return null
    return this._buildEditor(spec, comp, index)
  }

  private _buildEditor(spec: ComponentSpec, comp: ComponentData, index: number): ComponentEditor {
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
    editor.setRemovable(!this._nonRemovableTypes.includes(comp.type))
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

  /**
   * The dimmed stand-in for a dormant component: what is switched off,
   * where it was switched off, and one button that switches it back on.
   *
   * The button drives the window action rather than a signal of its own
   * so every host gets it for free — this widget has three, and the Game
   * › Rules page needs the same verb.
   */
  private _buildDormantGroup(facts: DormantComponentFacts): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
      title: _(facts.componentLabel),
      cssClasses: ['dim-label'],
    })
    const row = new Adw.ActionRow({
      title: _('Switched off in Game › Rules'),
      subtitle: _('Its settings are kept, and work again once “%s” is on').replace('%s', _(facts.systemLabel)),
      subtitleLines: 0,
    })
    row.add_prefix(new Gtk.Image({ iconName: facts.icon, valign: Gtk.Align.CENTER }))
    const button = new Gtk.Button({ label: _('Turn on'), valign: Gtk.Align.CENTER })
    button.set_action_name('win.enable-game-system')
    button.set_action_target_value(GLib.Variant.new_string(facts.systemId))
    row.add_suffix(button)
    group.add(row)
    return group
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

  private _lastRenderedOrNull(): Gtk.Widget | null {
    return this._rendered.length > 0 ? this._rendered[this._rendered.length - 1] : null
  }

  private _removeComponent(index: number): void {
    this._components.splice(index, 1)
    this._rebuild()
    this._emitChange()
  }

  /** What the chooser would offer right now, grouped by owning system. */
  private _addableGroups(): AddableComponentGroup[] {
    return addableComponentGroups(
      this._offeredRegistry(),
      this._components.map((c) => c.type),
    )
  }

  /** Nothing left to add means an insensitive row, not an empty dialog. */
  private _refreshAddRow(): void {
    this._addRow.set_sensitive(this._addableGroups().length > 0)
  }

  private _presentAddDialog(): void {
    const groups = this._addableGroups()
    if (groups.length === 0) return
    presentAddComponentDialog(this, groups, (type) => {
      const spec = this._registry[type]
      if (spec) this._addComponent(spec)
    })
  }

  private _addComponent(spec: ComponentSpec): void {
    this._components.push(defaultComponentData(spec))
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
