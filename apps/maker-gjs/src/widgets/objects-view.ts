import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { EntityDefinition } from '@pixelrpg/engine'
import { type ComponentRefOptions, EntityComponentsEditor, type ModeRail, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { ENTITY_TEMPLATES } from '../services/entity-templates.ts'
import Template from './objects-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

GObject.type_ensure(EntityComponentsEditor.$gtype)

/**
 * Objects library view — master-detail over the project's world-object
 * entity definitions (the non-character `entityLibrary` entries). The
 * gallery lists them; the detail page edits one through a name field + the
 * generated {@link EntityComponentsEditor}. Pure view: all persistence /
 * collab rides `ObjectsController` via the emitted signals.
 */
export class ObjectsView extends ResponsiveEditorView {
  declare _outer_split: Adw.OverlaySplitView
  declare _nav: Adw.NavigationView
  declare _new_object_button: Gtk.Button
  declare _list_stack: Gtk.Stack
  declare _objects_list: Gtk.ListBox
  declare _detail_page: Adw.NavigationPage
  declare _delete_button: Gtk.Button
  declare _detail_slot: Gtk.Box

  private _objects: EntityDefinition[] = []
  private _activeId: string | null = null
  private _nameRow: Adw.EntryRow
  private _editor: EntityComponentsEditor
  private _refOptions: ComponentRefOptions = {}
  private _silentName = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'ObjectsView',
        Template,
        InternalChildren: [
          'outer_split',
          'mode_rail',
          'nav',
          'new_object_button',
          'list_stack',
          'objects_list',
          'detail_page',
          'delete_button',
          'detail_slot',
        ],
        Signals: {
          // mode-changed is inherited from ResponsiveEditorView.
          // Whole EntityDefinition JSON after an inspector edit.
          'object-changed': { param_types: [GObject.TYPE_STRING] },
          // A template id chosen in the "New object" dialog.
          'object-create-requested': { param_types: [GObject.TYPE_STRING] },
          // Object id to delete.
          'object-delete-requested': { param_types: [GObject.TYPE_STRING] },
          // Object id + the new name.
          'object-rename-requested': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
        },
      },
      ObjectsView,
    )
  }

  constructor() {
    super()
    // Build the detail body once: a name group + the components editor.
    const nameGroup = new Adw.PreferencesGroup()
    this._nameRow = new Adw.EntryRow({ title: _('Name') })
    nameGroup.add(this._nameRow)
    this._editor = new EntityComponentsEditor()
    this._detail_slot.append(nameGroup)
    this._detail_slot.append(this._editor)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail as ModeRail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
    })
    this.signals.connect(this._new_object_button, 'clicked', () => this._presentTemplateChooser())
    this.signals.connect(this._delete_button, 'clicked', () => {
      if (this._activeId) this._confirmDelete(this._activeId)
    })
    this.signals.connect(this._nameRow, 'changed', () => {
      if (this._silentName || !this._activeId) return
      this.emit('object-rename-requested', this._activeId, this._nameRow.get_text())
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

  /** Replace the object list + rebuild the gallery rows. */
  setObjects(objects: EntityDefinition[]): void {
    this._objects = objects
    let child = this._objects_list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._objects_list.remove(child)
      child = next
    }
    for (const obj of objects) {
      const row = new Adw.ActionRow({ title: obj.name || obj.id, activatable: true })
      row.add_prefix(new Gtk.Image({ iconName: obj.editorData?.icon ?? 'view-grid-symbolic' }))
      row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', cssClasses: ['dim-label'] }))
      row.connect('activated', () => this.focusObject(obj.id))
      this._objects_list.append(row)
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
    this._editor.setRefOptions(this._refOptions)
    this._editor.setEntity(obj)
  }

  /** Present the template chooser; the chosen template id drives creation. */
  private _presentTemplateChooser(): void {
    const dialog = new Adw.AlertDialog({
      heading: _('New object'),
      body: _('Pick a starting template — you can change everything afterwards.'),
    })
    const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
    for (const template of ENTITY_TEMPLATES) {
      if (template.id === 'character') continue // characters live in the Cast view
      const row = new Adw.ActionRow({ title: template.label, subtitle: template.description, activatable: true })
      row.add_prefix(new Gtk.Image({ iconName: template.icon }))
      row.connect('activated', () => {
        dialog.close()
        this.emit('object-create-requested', template.id)
      })
      list.append(row)
    }
    dialog.set_extra_child(list)
    dialog.add_response('cancel', _('Cancel'))
    dialog.present(this)
  }

  private _confirmDelete(id: string): void {
    const obj = this._objects.find((o) => o.id === id)
    const dialog = new Adw.AlertDialog({
      heading: _('Delete object?'),
      body: _('“%s” will be removed from the project library.').replace('%s', obj?.name ?? id),
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('delete', _('Delete'))
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      if (response === 'delete') this.emit('object-delete-requested', id)
    })
    dialog.present(this)
  }
}
