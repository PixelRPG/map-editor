import {
  applyEntityRemove,
  applyEntityUpsert,
  createEntityRemoveOp,
  createEntityUpsertOp,
  type EntityDefinition,
  GameProjectFormat,
  isCharacterEntity,
} from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import type { ObjectsView } from '../widgets/objects-view.ts'
import type { CollabSession } from './collab-session.ts'
import { type EntityTemplate, findEntityTemplate } from './entity-templates.ts'
import { writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'

/**
 * Controller for the **Objects library** view — the GENERAL lens over the
 * project's `GameProjectData.entityLibrary`: it lists EVERY entity
 * definition (world objects AND `character`-template cast members), edited
 * raw through the generated component inspector. The Cast view is a
 * specialised friendly lens over the character subset of the same library.
 * Mirrors the Cast controller: every mutation writes the in-memory data,
 * persists the project JSON, and broadcasts a `__project/entity.*` op so
 * peers stay in sync. Remote ops are applied centrally by the Cast
 * controller (single applier); this view just re-`refresh`es when notified.
 */
export class ObjectsController {
  private _project: LoadedProject | null = null
  private _session: CollabSession | null = null
  /**
   * Invoked after a local entity upsert / delete so the host can refresh
   * the OTHER lens (the Cast view) — the two views now overlap on the
   * shared `entityLibrary`, so an edit in one must reflect in the other.
   * Null until the host wires it.
   */
  onEntityLibraryChanged: (() => void) | null = null

  constructor(
    public readonly view: ObjectsView,
    private readonly onToast: (message: string) => void,
  ) {
    view.connect('object-changed', (_v: ObjectsView, json: string) => this._onObjectChanged(json))
    view.connect('object-create-requested', (_v: ObjectsView, templateId: string) =>
      this.createFromTemplate(templateId),
    )
    view.connect('object-delete-requested', (_v: ObjectsView, id: string) => this._deleteObject(id))
    view.connect('object-rename-requested', (_v: ObjectsView, id: string, name: string) => this._renameObject(id, name))
    view.connect('object-cast-toggle-requested', (_v: ObjectsView, id: string, isCast: boolean) =>
      this._setCastMember(id, isCast),
    )
  }

  setProject(project: LoadedProject | null): void {
    this._project = project
    void this.refresh()
  }

  setCollabSession(session: CollabSession | null): void {
    this._session = session
  }

  /** Every entity definition in the project library (the general lens). */
  private _objects(): EntityDefinition[] {
    return this._project?.resource?.data?.entityLibrary ?? []
  }

  /** Push the current object list + project-scoped ref options into the view. */
  refresh(): void {
    const data = this._project?.resource?.data
    if (!data) {
      this.view.setObjects([])
      return
    }
    this.view.setRefOptions({
      maps: (data.maps ?? []).map((m) => ({ value: m.id, label: m.name ?? m.id })),
      appearances: this._project?.resource?.spriteSets
        ? [...this._project.resource.spriteSets.entries()].map(([id, set]) => ({
            value: id,
            label: set.data?.name ?? id,
          }))
        : [],
    })
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
    this._upsert(entity)
  }

  /** Create a new object from a template id, focus it. Public (driven by
   * the view's "New object" dialog AND the `win.new-object` action). */
  createFromTemplate(templateId: string): void {
    const data = this._project?.resource?.data
    if (!data) return
    const template = findEntityTemplate(templateId)
    if (!template) return
    const id = this._uniqueId(template.label, new Set((data.entityLibrary ?? []).map((e) => e.id)))
    const entity = this._seedEntity(id, template)
    this._upsert(entity)
    this.refresh()
    this.view.focusObject(id)
  }

  /** Build a fresh entity from a template (deep-copied components). */
  private _seedEntity(id: string, template: EntityTemplate): EntityDefinition {
    return {
      id,
      name: template.label,
      components: template.components.map((c) => ({ ...c })),
      editorData: { template: template.id, icon: template.icon },
    }
  }

  private _renameObject(id: string, name: string): void {
    const existing = this._objects().find((e) => e.id === id)
    if (!existing) return
    this._upsert({ ...existing, name })
  }

  /**
   * Promote / demote an entity into the friendly Cast roster by flipping
   * its `editorData.template` ↔ `'character'`. Promoting a world object
   * (e.g. an NPC made here) makes it show in the Cast view's character
   * inspector; demoting returns it to a plain library object. Components
   * are untouched — only the editor classification changes. The
   * `onEntityLibraryChanged` hook (in `_upsert`) refreshes the Cast view.
   */
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
    this._upsert({ ...existing, editorData })
    this.refresh()
  }

  private _deleteObject(id: string): void {
    const data = this._project?.resource?.data
    if (!data?.entityLibrary?.some((e) => e.id === id)) return
    applyEntityRemove(data, id)
    this._persist()
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityRemoveOp({ peerId, seq, entityId: id }))
    this.refresh()
    this.onEntityLibraryChanged?.()
  }

  /** Single write path: persist + broadcast the entity as an `entityLibrary` entry. */
  private _upsert(entity: EntityDefinition): void {
    const data = this._project?.resource?.data
    if (!data) return
    applyEntityUpsert(data, entity)
    this._persist()
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityUpsertOp({ peerId, seq, entity }))
    this.onEntityLibraryChanged?.()
  }

  private _persist(): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    try {
      if (!writeTextFile(resource.path, GameProjectFormat.serialize(resource.data))) {
        this.onToast(_('Could not save project'))
      }
    } catch (err) {
      console.warn('[ObjectsController] Failed to persist project:', err)
      this.onToast(_('Could not save project'))
    }
  }

  /** Lowest unused id derived from `name` (`npc`, `npc-2`, …). */
  private _uniqueId(name: string, taken: Set<string>): string {
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'object'
    let id = base
    let n = 2
    while (taken.has(id)) id = `${base}-${n++}`
    return id
  }
}
