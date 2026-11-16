import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import { isCharacterEntity } from '@pixelrpg/engine'
import type { ComponentRefOptions } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { ENTITY_TEMPLATES, type EntityTemplate, templatesForView } from '../services/entity-templates.ts'
import { canBeCastMember } from '../services/entity-visuals.ts'
import { groupThingsByCategory } from '../services/thing-categories.ts'
import type { ObjectDetailActions, ObjectDetailPane } from './objects/object-detail-pane.ts'
import { confirmObjectDelete, presentTemplateChooser } from './objects/object-dialogs.ts'
import { buildObjectRow } from './objects/object-gallery.ts'
import Template from './objects-view.blp'

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
  'detail-requested': () => void
  'detail-title': (title: string) => void
}

/**
 * The Library's **Things** gallery — the GENERAL lens over EVERY entity
 * definition in the project's `entityLibrary`; it lists the
 * non-character ones (characters live on their own chip), grouped by
 * `editorData.category` — Objects, then whatever a game system stamps.
 * {@link ObjectDetailPane} edits one raw through a name field + the
 * generated components editor; it lives in the `LibraryView` host's one
 * `Adw.NavigationSplitView` and is joined by {@link attachDetail}.
 *
 * The Characters chip is the specialised friendly lens over the
 * character subset. Pure view: all persistence / collab rides
 * `ObjectsController` via the emitted signals; the mode rail, the
 * header and the detail's delete button belong to the host.
 */
export class ObjectsView extends Adw.Bin {
  declare _list_stack: Gtk.Stack
  declare _objects_groups: Gtk.Box

  /** The content half, joined by {@link attachDetail}. */
  private _detail: ObjectDetailPane | null = null
  private _objects: EntityDefinition[] = []
  private _activeId: string | null = null
  private _refOptions: ComponentRefOptions = {}
  private _templates: readonly EntityTemplate[] = ENTITY_TEMPLATES
  private _fullView = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'ObjectsView',
        Template,
        InternalChildren: ['list_stack', 'objects_groups'],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the detail editor and the template chooser show everything — pushed from the Library host',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // The detail's delete button lives in the Library host's
          // header, so the host binds its `sensitive` to this rather
          // than reaching into the gallery's selection state.
          'has-active': GObject.ParamSpec.boolean(
            'has-active',
            'Has active',
            'Whether a thing is currently open in the detail pane',
            GObject.ParamFlags.READABLE,
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
          // Reveal the detail half (the host's split drills in when collapsed).
          'detail-requested': {},
          // What the host's detail header should be called.
          'detail-title': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ObjectsView,
    )
  }

  declare connect: GObject.SignalMethods<this, ObjectsViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, ObjectsViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, ObjectsViewSignals>['emit']

  /**
   * Join the two halves of the gallery → detail pattern. Called ONCE
   * from the `LibraryView` host's constructor, outside any map scope:
   * the pane and this gallery are mapped at different times (a collapsed
   * split unmaps the sidebar while the content shows), so the join
   * itself must outlive both.
   */
  attachDetail(detail: ObjectDetailPane): void {
    this._detail = detail
    detail.bindActions(this._detailActions())
    this._refreshDetail()
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
      createFromTemplate: (templateId) => this.emit('object-create-requested', templateId),
    }
  }

  /** The slim empty state's button — drill into the detail's tiles. */
  _onEmptyStartClicked(): void {
    this.emit('detail-requested')
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._refreshDetail()
  }

  /** Project-scoped picker options for the inspector's `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    this._detail?.setRefOptions(options)
  }

  /**
   * The components this project may edit — `effectiveComponentRegistry`,
   * so a component whose game system is switched off is not offered in
   * the Add menu. Data already on an entity is left untouched either way.
   */
  setComponentRegistry(registry: ComponentSpecRegistry): void {
    this._detail?.setRegistry(registry)
  }

  /**
   * The templates the "+" chooser offers — built-ins plus the templates
   * of every switched-on game system.
   */
  setTemplates(templates: readonly EntityTemplate[]): void {
    this._templates = templates
    this._refreshDetail()
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
    const things = objects.filter((o) => !isCharacterEntity(o))
    for (const group of groupThingsByCategory(things)) {
      // msgid stays literal in `thing-categories.ts`; translated here.
      const widget = new Adw.PreferencesGroup({ title: _(group.label) })
      for (const obj of group.things) widget.add(buildObjectRow(obj, () => this.focusObject(obj.id)))
      this._objects_groups.append(widget)
    }
    this._list_stack.set_visible_child_name(things.length > 0 ? 'list' : 'empty')
    // The vanish check runs against ALL objects, not just the things:
    // flipping the open thing into a character takes it out of the
    // gallery but should keep its detail open, mid-edit.
    if (this._activeId && !objects.some((o) => o.id === this._activeId)) this._setActive(null)
    // § 4.4: never a "No selection" pane — land on the first thing.
    if (!this._activeId && things.length > 0) this._setActive(things[0].id)
    this._refreshDetail()
  }

  /** Select an object AND reveal its detail. No-op if unknown. */
  focusObject(id: string): void {
    if (!this._objects.some((o) => o.id === id)) return
    this._setActive(id)
    this._populateDetail(id)
    this.emit('detail-requested')
  }

  /** Whether a thing is open in the detail — see the `has-active` property. */
  get hasActive(): boolean {
    return this._activeId !== null
  }

  private _setActive(id: string | null): void {
    const had = this._activeId !== null
    this._activeId = id
    if (had !== (id !== null)) this.notify('has-active')
  }

  /**
   * Delete the open thing, after confirmation. Public: the detail's
   * delete button lives in the Library host's detail header.
   */
  confirmDeleteActive(): void {
    if (this._activeId) this._confirmDelete(this._activeId)
  }

  /**
   * Put the detail on the page the current state calls for: the open
   * thing, the "pick one" placeholder, or — when the project holds no
   * things at all — the onboarding page with the template tiles.
   */
  private _refreshDetail(): void {
    if (this._activeId) {
      this._populateDetail(this._activeId)
      return
    }
    if (this._objects.some((o) => !isCharacterEntity(o))) {
      this.emit('detail-title', _('Thing'))
      this._detail?.showEmpty()
      return
    }
    this.emit('detail-title', _('Things'))
    this._detail?.showNoThings(templatesForView(this._templates, this._fullView))
  }

  private _populateDetail(id: string): void {
    const obj = this._objects.find((o) => o.id === id)
    if (!obj) return
    this.emit('detail-title', obj.name || obj.id || _('Thing'))
    this._detail?.showObject({
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

  private _confirmDelete(id: string): void {
    const name = this._objects.find((o) => o.id === id)?.name ?? id
    confirmObjectDelete(this, name, () => this.emit('object-delete-requested', id))
  }
}
