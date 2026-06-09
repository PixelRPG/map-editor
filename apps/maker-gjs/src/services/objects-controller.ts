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
 * Controller for the **Objects library** view: CRUD over the world-object
 * entries in `GameProjectData.entityLibrary` (everything that is NOT a
 * `character`-template entity — those are the Cast view's). Mirrors the
 * Cast controller: every mutation writes the in-memory data, persists the
 * project JSON, and broadcasts a `__project/entity.*` op so peers stay in
 * sync. Remote ops are applied centrally by the Cast controller (single
 * applier); this view just re-`refresh`es when notified.
 */
export class ObjectsController {
  private _project: LoadedProject | null = null
  private _session: CollabSession | null = null

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
  }

  setProject(project: LoadedProject | null): void {
    this._project = project
    void this.refresh()
  }

  setCollabSession(session: CollabSession | null): void {
    this._session = session
  }

  /** The object (non-character) entity definitions in the project library. */
  private _objects(): EntityDefinition[] {
    return (this._project?.resource?.data?.entityLibrary ?? []).filter((e) => !isCharacterEntity(e))
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

  private _deleteObject(id: string): void {
    const data = this._project?.resource?.data
    if (!data?.entityLibrary?.some((e) => e.id === id)) return
    applyEntityRemove(data, id)
    this._persist()
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityRemoveOp({ peerId, seq, entityId: id }))
    this.refresh()
  }

  /** Single write path: persist + broadcast the entity as an `entityLibrary` entry. */
  private _upsert(entity: EntityDefinition): void {
    const data = this._project?.resource?.data
    if (!data) return
    applyEntityUpsert(data, entity)
    this._persist()
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityUpsertOp({ peerId, seq, entity }))
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
