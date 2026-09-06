import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import { isCharacterEntity } from '@pixelrpg/engine'
import { type ComponentRefOptions, EntityComponentsEditor, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { ENTITY_TEMPLATES, type EntityTemplate } from '../services/entity-templates.ts'
import { canBeCastMember } from '../services/entity-visuals.ts'
import { groupThingsByCategory } from '../services/thing-categories.ts'
import { confirmObjectDelete, presentTemplateChooser } from './objects/object-dialogs.ts'
import { buildObjectRow, buildRelationshipDiagram, buildTemplateTiles } from './objects/object-gallery.ts'
import Template from './objects-view.blp'

GObject.type_ensure(EntityComponentsEditor.$gtype)

/**
 * The Library's **Things** page — the GENERAL master-detail lens over
 * EVERY entity definition in the project's `entityLibrary` (world objects
 * AND the `character`-template cast members, the latter flagged with a
 * "Character" badge). The gallery lists them grouped by
 * `editorData.category` — Objects, Heroes, NPCs, then whatever a game
 * system stamps; the detail page edits one raw through a name field +
 * the generated {@link EntityComponentsEditor}.
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
  declare _detail_slot: Gtk.Box

  private _objects: EntityDefinition[] = []
  private _activeId: string | null = null
  private _nameRow: Adw.EntryRow
  private _castRow: Adw.SwitchRow
  private _editor: EntityComponentsEditor
  private _refOptions: ComponentRefOptions = {}
  private _templates: readonly EntityTemplate[] = ENTITY_TEMPLATES
  private _silentName = false
  private _silentCast = false
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
          'detail_slot',
        ],
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

  constructor() {
    super()
    // Build the detail body once: a name group (name + the "Character"
    // toggle) + the components editor.
    const nameGroup = new Adw.PreferencesGroup()
    this._nameRow = new Adw.EntryRow({ title: _('Name') })
    nameGroup.add(this._nameRow)
    // Promote/demote an actor-like entity into the friendly Characters
    // roster. Only shown for entities with a `visual` component (a
    // character needs an appearance); flips `editorData.template` ↔
    // 'character'.
    this._castRow = new Adw.SwitchRow({
      title: _('Character'),
      subtitle: _('Show under Characters — edit its look, speed and player flag there.'),
    })
    nameGroup.add(this._castRow)
    this._editor = new EntityComponentsEditor()
    this._detail_slot.append(nameGroup)
    this._detail_slot.append(this._editor)

    this._buildEmptyState()
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
    this.signals.connect(this._nameRow, 'changed', () => {
      if (this._silentName || !this._activeId) return
      this.emit('object-rename-requested', this._activeId, this._nameRow.get_text())
    })
    this.signals.connect(this._castRow, 'notify::active', () => {
      if (this._silentCast || !this._activeId) return
      this.emit('object-cast-toggle-requested', this._activeId, this._castRow.get_active())
    })
    this.signals.connect(this._editor, 'entity-changed', (_e: EntityComponentsEditor, json: string) => {
      this.emit('object-changed', json)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Project-scoped picker options for the inspector's `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    this._editor.setRefOptions(options)
  }

  /**
   * The components this project may edit — `effectiveComponentRegistry`,
   * so a component whose game system is switched off is not offered in
   * the Add menu. Data already on an entity is left untouched either way.
   */
  setComponentRegistry(registry: ComponentSpecRegistry): void {
    this._editor.setRegistry(registry)
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
    for (const group of groupThingsByCategory(objects)) {
      // msgid stays literal in `thing-categories.ts`; translated here.
      const widget = new Adw.PreferencesGroup({ title: _(group.label) })
      for (const obj of group.things) widget.add(buildObjectRow(obj, () => this.focusObject(obj.id)))
      this._objects_groups.append(widget)
    }
    this._list_stack.set_visible_child_name(objects.length > 0 ? 'list' : 'empty')
    // If the open object vanished (deleted), drop back to the gallery.
    if (this._activeId && !objects.some((o) => o.id === this._activeId)) {
      this._activeId = null
      if (this._nav.get_visible_page()?.tag === 'detail') this._nav.replace_with_tags(['gallery'])
    } else if (this._activeId) {
      // Refresh the detail with the latest data (e.g. remote edit).
      this._populateDetail(this._activeId)
    }
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
    this._silentName = true
    this._nameRow.set_text(obj.name)
    this._silentName = false
    this._castRow.set_visible(canBeCastMember(obj))
    this._silentCast = true
    this._castRow.set_active(isCharacterEntity(obj))
    this._silentCast = false
    this._editor.setRefOptions(this._refOptions)
    this._editor.setEntity(obj)
  }

  /**
   * Present the template chooser; the chosen template id drives creation.
   * Public: the "+" button lives in the Library host's header.
   */
  presentTemplateChooser(): void {
    presentTemplateChooser(this, this._templates, (templateId) => this.emit('object-create-requested', templateId))
  }

  private _rebuildTemplateTiles(): void {
    let child = this._empty_templates.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._empty_templates.remove(child)
      child = next
    }
    buildTemplateTiles(this._empty_templates, this._templates, (templateId) =>
      this.emit('object-create-requested', templateId),
    )
  }

  private _confirmDelete(id: string): void {
    const name = this._objects.find((o) => o.id === id)?.name ?? id
    confirmObjectDelete(this, name, () => this.emit('object-delete-requested', id))
  }
}
