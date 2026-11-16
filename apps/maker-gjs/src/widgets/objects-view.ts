import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import { isCharacterEntity } from '@pixelrpg/engine'
import { type ComponentRefOptions, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { ENTITY_TEMPLATES, type EntityTemplate, templatesForView } from '../services/entity-templates.ts'
import { canBeCastMember } from '../services/entity-visuals.ts'
import { groupThingsByCategory } from '../services/thing-categories.ts'
import type { ObjectDetailActions } from './objects/object-detail-pane.ts'
import { ObjectDetailPane } from './objects/object-detail-pane.ts'
import { confirmObjectDelete, presentTemplateChooser } from './objects/object-dialogs.ts'
import { buildObjectRow, buildRelationshipDiagram, buildTemplateTiles } from './objects/object-gallery.ts'
import Template from './objects-view.blp'

GObject.type_ensure(ObjectDetailPane.$gtype)

/**
 * Typed view of the signals {@link ObjectsView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface ObjectsViewSignals extends Adw.Bin.SignalSignatures {
  'object-changed': (objectJson: string) => void
  'object-create-requested': (defJson: string) => void
  'object-delete-requested': (defId: string) => void
  'object-rename-requested': (defId: string, name: string) => void
  'object-cast-toggle-requested': (defId: string, isCast: boolean) => void
}

/**
 * The Library's **Things** page — the GENERAL master-detail lens over
 * EVERY entity definition in the project's `entityLibrary`; the gallery
 * lists the non-character ones (characters live on their own page),
 * grouped by `editorData.category` — Objects, then whatever a game
 * system stamps; {@link ObjectDetailPane} edits one raw through a name
 * field + the generated components editor.
 * The Characters page is the specialised friendly lens over the character
 * subset. Pure view: all persistence / collab rides `ObjectsController`
 * via the emitted signals; the mode rail and the header (chips + "+")
 * belong to the `LibraryView` host.
 */
export class ObjectsView extends Adw.Bin {
  declare _nav: Adw.NavigationView
  declare _list_stack: Gtk.Stack
  declare _objects_groups: Gtk.Box
  declare _empty_diagram_slot: Gtk.Box
  declare _empty_templates: Gtk.FlowBox
  declare _detail_page: Adw.NavigationPage
  declare _delete_button: Gtk.Button
  declare _detail_pane: ObjectDetailPane

  private _objects: EntityDefinition[] = []
  private _activeId: string | null = null
  private _refOptions: ComponentRefOptions = {}
  private _templates: readonly EntityTemplate[] = ENTITY_TEMPLATES
  private _fullView = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'ObjectsView',
        Template,
        InternalChildren: [
          'nav',
          'list_stack',
          'objects_groups',
          'empty_diagram_slot',
          'empty_templates',
          'detail_page',
          'delete_button',
          'detail_pane',
        ],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the detail editor and the template chooser show everything — pushed from the Library host',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          // Whole EntityDefinition JSON after an inspector edit.
          'object-changed': { param_types: [GObject.TYPE_STRING] },
          // A template id chosen in the "New object" dialog.
          'object-create-requested': { param_types: [GObject.TYPE_STRING] },
          // Object id to delete.
          'object-delete-requested': { param_types: [GObject.TYPE_STRING] },
          // Object id + the new name.
          'object-rename-requested': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
          // Object id + whether it should be a Cast member (character).
          'object-cast-toggle-requested': { param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN] },
        },
      },
      ObjectsView,
    )
  }

  declare connect: GObject.SignalMethods<this, ObjectsViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, ObjectsViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, ObjectsViewSignals>['emit']

  constructor() {
    super()
    this.attachDetail()
    this._buildEmptyState()
  }

  /**
   * Join the two halves of the gallery → detail pattern. Done ONCE here,
   * outside any map scope: the pane and this gallery are mapped at
   * different times (a collapsed split unmaps the sidebar while the
   * content shows), so the join itself must outlive both.
   */
  private attachDetail(): void {
    this._detail_pane.bindActions(this._detailActions())
    this._detail_pane.showEmpty()
  }

  /** What the detail pane may ask for on behalf of the open thing. */
  private _detailActions(): ObjectDetailActions {
    return {
      rename: (name) => {
        if (this._activeId) this.emit('object-rename-requested', this._activeId, name)
      },
      setCast: (isCast) => {
        if (this._activeId) this.emit('object-cast-toggle-requested', this._activeId, isCast)
      },
      entityChanged: (json) => this.emit('object-changed', json),
    }
  }

  /**
   * Populate the empty state: the relationship diagram (Graphics →
   * Characters → Things) plus the template tiles, which reuse the same
   * `object-create-requested` path as the "+" template chooser.
   */
  private _buildEmptyState(): void {
    buildRelationshipDiagram(this._empty_diagram_slot)
    this._rebuildTemplateTiles()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._delete_button, 'clicked', () => {
      if (this._activeId) this._confirmDelete(this._activeId)
    })
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._rebuildTemplateTiles()
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Project-scoped picker options for the inspector's `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    this._detail_pane.setRefOptions(options)
  }

  /**
   * The components this project may edit — `effectiveComponentRegistry`,
   * so a component whose game system is switched off is not offered in
   * the Add menu. Data already on an entity is left untouched either way.
   */
  setComponentRegistry(registry: ComponentSpecRegistry): void {
    this._detail_pane.setRegistry(registry)
  }

  /**
   * The templates the "+" chooser offers — built-ins plus the templates
   * of every switched-on game system.
   */
  setTemplates(templates: readonly EntityTemplate[]): void {
    this._templates = templates
    this._rebuildTemplateTiles()
  }

  /** Replace the object list + rebuild the gallery, one group per category. */
  setObjects(objects: EntityDefinition[]): void {
    this._objects = objects
    let child = this._objects_groups.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._objects_groups.remove(child)
      child = next
    }
    // Characters live on their own page; Things lists what a map holds.
    for (const group of groupThingsByCategory(objects.filter((o) => !isCharacterEntity(o)))) {
      // msgid stays literal in `thing-categories.ts`; translated here.
      const widget = new Adw.PreferencesGroup({ title: _(group.label) })
      for (const obj of group.things) widget.add(buildObjectRow(obj, () => this.focusObject(obj.id)))
      this._objects_groups.append(widget)
    }
    this._list_stack.set_visible_child_name(objects.some((o) => !isCharacterEntity(o)) ? 'list' : 'empty')
    // If the open object vanished (deleted), drop back to the gallery.
    if (this._activeId && !objects.some((o) => o.id === this._activeId)) {
      this._activeId = null
      this._detail_pane.showEmpty()
      if (this._nav.get_visible_page()?.tag === 'detail') this._nav.replace_with_tags(['gallery'])
    } else if (this._activeId) {
      // Refresh the detail with the latest data (e.g. remote edit).
      this._populateDetail(this._activeId)
    }
  }

  /**
   * Pop the detail page back to the gallery, and say whether there was a
   * page to pop — back step 4 (REDESIGN.md § 3.4).
   */
  popPage(): boolean {
    if (!this.hasPushedPage()) return false
    this._nav.pop()
    return true
  }

  /** Whether a detail page is pushed over the gallery. */
  hasPushedPage(): boolean {
    return this._nav.get_visible_page()?.tag === 'detail'
  }

  /** Open the detail page for an object id. No-op if unknown. */
  focusObject(id: string): void {
    if (!this._objects.some((o) => o.id === id)) return
    this._activeId = id
    this._populateDetail(id)
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  private _populateDetail(id: string): void {
    const obj = this._objects.find((o) => o.id === id)
    if (!obj) return
    this._detail_page.set_title(obj.name || obj.id)
    this._detail_pane.showObject({
      object: obj,
      canBeCast: canBeCastMember(obj),
      isCast: isCharacterEntity(obj),
      refOptions: this._refOptions,
    })
  }

  /**
   * Present the template chooser; the chosen template id drives creation.
   * Public: the "+" button lives in the Library host's header.
   */
  presentTemplateChooser(): void {
    presentTemplateChooser(this, templatesForView(this._templates, this._fullView), (templateId) =>
      this.emit('object-create-requested', templateId),
    )
  }

  private _rebuildTemplateTiles(): void {
    let child = this._empty_templates.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._empty_templates.remove(child)
      child = next
    }
    buildTemplateTiles(this._empty_templates, templatesForView(this._templates, this._fullView), (templateId) =>
      this.emit('object-create-requested', templateId),
    )
  }

  private _confirmDelete(id: string): void {
    const name = this._objects.find((o) => o.id === id)?.name ?? id
    confirmObjectDelete(this, name, () => this.emit('object-delete-requested', id))
  }
}
