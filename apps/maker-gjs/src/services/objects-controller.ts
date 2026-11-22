import { type EntityDefinition, isCharacterEntity } from '@pixelrpg/engine'
import type { ObjectsView } from '../widgets/objects-view.ts'
import {
  captureEntityDeletion,
  deletedEntityLabel,
  type EntityDeleteHost,
  restoreEntityDeletion,
} from './entity-deletion.ts'
import { entityTemplatesFor, type EntityTemplate, findEntityTemplate } from './entity-templates.ts'
import { type ProjectStore, uniqueIdFrom } from './project-store.ts'

/**
 * The **Objects lens** — the GENERAL view over the {@link ProjectStore}'s
 * `entityLibrary`: it lists EVERY entity definition (world objects AND
 * `character`-template cast members), edited raw through the generated
 * component inspector. The Cast view is a specialised friendly lens over
 * the character subset of the same library.
 *
 * Every mutation routes through the store — the single persist +
 * collab-broadcast pipeline; this controller holds no project/session
 * reference of its own. Store changes (the Cast lens's edits, inbound
 * peer ops) flow back via the typed `entity-library-changed` event, so
 * this view re-hydrates automatically.
 */
export class ObjectsController {
  constructor(
    public readonly view: ObjectsView,
    private readonly store: ProjectStore,
    private readonly host: EntityDeleteHost,
  ) {
    view.connect('object-changed', (_v: ObjectsView, json: string) => this._onObjectChanged(json))
    view.connect('object-create-requested', (_v: ObjectsView, templateId: string, name: string) =>
      this.createFromTemplate(templateId, name || undefined),
    )
    view.connect('object-delete-requested', (_v: ObjectsView, id: string) => this._deleteObject(id))
    view.connect('object-rename-requested', (_v: ObjectsView, id: string, name: string) => this._renameObject(id, name))
    view.connect('object-cast-toggle-requested', (_v: ObjectsView, id: string, isCast: boolean) =>
      this._setCastMember(id, isCast),
    )
    store.on('project-changed', () => this.refresh())
    store.on('languages-changed', () => this.refresh())
    // The other lens (Cast) or a peer edited the shared entityLibrary —
    // re-hydrate. Our own edits skip this (the mutation paths below
    // refresh inline exactly where the old behaviour did).
    store.on('entity-library-changed', ({ source }) => {
      if (source !== 'objects') this.refresh()
    })
  }

  /** Every entity definition in the project library (the general lens). */
  private _objects(): EntityDefinition[] {
    return this.store.entities()
  }

  /** Push the current object list + project-scoped ref options into the view. */
  refresh(): void {
    if (!this.store.data) {
      this.view.setObjects([])
      return
    }
    this.view.setRefOptions(this.store.refOptions())
    // The project's EFFECTIVE registry: a component whose game system is
    // off must not be offered in the Add menu even though the spec exists.
    this.view.setComponentRegistry(this.store.componentRegistry())
    this.view.setTemplates(entityTemplatesFor(this.store.data))
    this.view.setObjects(this._objects())
  }

  /** A `data-changed` JSON payload from the components editor → upsert. */
  private _onObjectChanged(json: string): void {
    let entity: EntityDefinition
    try {
      entity = JSON.parse(json) as EntityDefinition
    } catch {
      return
    }
    this.store.upsertEntity(entity, 'objects')
  }

  /**
   * Create a new object from a template id and land on its detail with
   * "Place on map" focused (§ 6.6). Public — driven by the view's "New
   * thing" dialog, the empty state's tiles AND the `win.new-object`
   * action.
   *
   * `name` is what the dialog's second page settled on. It stays
   * optional: the one-tap paths (empty-state tile, action, MCP) never
   * ask for a name, and then the thing is called after its template as
   * it always was.
   */
  createFromTemplate(templateId: string, name?: string): void {
    const data = this.store.data
    if (!data) return
    const template = findEntityTemplate(templateId, this.store.data)
    if (!template) return
    const id = uniqueIdFrom(template.label, new Set((data.entityLibrary ?? []).map((e) => e.id)), 'object')
    const entity = this._seedEntity(id, template, name)
    this.store.upsertEntity(entity, 'objects')
    this.refresh()
    this.view.focusNewObject(id)
  }

  /** Build a fresh entity from a template (deep-copied components). */
  private _seedEntity(id: string, template: EntityTemplate, name?: string): EntityDefinition {
    return {
      id,
      name: name ?? template.label,
      components: template.components.map((c) => ({ ...c })),
      editorData: {
        template: template.id,
        icon: template.icon,
        ...(template.category ? { category: template.category } : {}),
      },
    }
  }

  private _renameObject(id: string, name: string): void {
    const existing = this._objects().find((e) => e.id === id)
    if (!existing) return
    this.store.upsertEntity({ ...existing, name }, 'objects')
  }

  /**
   * Flip an entity's Cast membership (public — driven by the
   * `win.toggle-object-cast` action / MCP; the in-view path is the
   * "Cast member" switch). No-op on an unknown id.
   */
  toggleCastMember(id: string): void {
    const existing = this._objects().find((e) => e.id === id)
    if (!existing) return
    this._setCastMember(id, !isCharacterEntity(existing))
  }

  /**
   * Promote / demote an entity into the friendly Cast roster by flipping
   * its `editorData.template` ↔ `'character'`. Promoting a world object
   * (e.g. an NPC made here) makes it show in the Cast view's character
   * inspector; demoting returns it to a plain library object. Components
   * are untouched — only the editor classification changes. The store's
   * `entity-library-changed` event refreshes the Cast view.
   */
  private _setCastMember(id: string, isCast: boolean): void {
    const existing = this._objects().find((e) => e.id === id)
    if (!existing) return
    const editorData = { ...existing.editorData }
    if (isCast) {
      editorData.template = 'character'
      // Promoted world actors default to the NPC category (the hero is
      // created in the Cast view + tracked via `playerActorId`).
      if (!editorData.category) editorData.category = 'npc'
    } else {
      editorData.template = 'object'
    }
    this.store.upsertEntity({ ...existing, editorData }, 'objects')
    this.refresh()
  }

  /**
   * Drop a library entry. Unconfirmed on purpose — the snapshot taken
   * first turns the toast's Undo into the way back (REDESIGN.md § 4.4).
   */
  private _deleteObject(id: string): void {
    const deletion = captureEntityDeletion(this.store.entities(), id, this.store.data?.playerActorId)
    if (!this.store.removeEntity(id, 'objects')) return
    this.refresh()
    if (!deletion) return
    this.host.reportEntityDeleted(deletedEntityLabel(deletion), () => {
      restoreEntityDeletion(this.store, 'objects', deletion)
      this.refresh()
    })
  }
}
