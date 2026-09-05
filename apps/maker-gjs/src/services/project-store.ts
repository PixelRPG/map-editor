import GLib from '@girs/glib-2.0'
import {
  applyEntityRemove,
  applyEntityUpsert,
  applyMapEditorData,
  applyPlayerSet,
  applyProjectMetaUpdate,
  applySpriteSetReference,
  applySpriteSetRemove,
  applySpriteSetUpdate,
  type EntityDefinition,
  type GameProjectData,
  MAP_EDITOR_DATA_KIND,
  type MapEditorDataOp,
  PROJECT_META_UPDATE_KIND,
  type ProjectMetaUpdateOp,
  type ProjectOp,
  SPRITESET_REMOVE_KIND,
  type SpriteSetAddPayload,
  type SpriteSetData,
  SpriteSetResource,
  type SpriteSetUpdatePayload,
} from '@pixelrpg/engine'
import type { SpriteSetChoice, SpriteSetImportResult } from '@pixelrpg/gjs'
import type { LoadedProject } from './project-loader.ts'
import {
  bindProjectSinks,
  broadcastEntityRemove,
  broadcastEntityUpsert,
  broadcastPlayerSet,
  broadcastProjectMeta,
  broadcastSpriteSetAdd,
  broadcastSpriteSetRemove,
  broadcastSpriteSetUpdate,
  type ProjectSyncSession,
} from './project-store-broadcast.ts'
import { applyEntityLibraryOp, buildRefOptions, findEntityById, type RefOption } from './project-store-entities.ts'
import type { EntityLibraryChangeSource, ProjectStoreEvents } from './project-store-events.ts'
import {
  DEFAULT_PROJECT_STORE_IO,
  deleteSpriteSetFiles,
  isPlainFilename,
  type ProjectStoreIo,
  type SpriteSetPaths,
  spriteSetPaths,
  writeProjectData,
  writeSpriteSetDescriptor,
} from './project-store-persistence.ts'
import {
  buildImportedSpriteSetData,
  draftSpriteSetData,
  nextFirstGid,
  orderSpriteSetReferences,
  uniqueIdFrom,
  withImagePath,
  writeTileSurface,
} from './project-store-sprite-sets.ts'
import { TypedEmitter } from './typed-emitter.ts'

export { uniqueIdFrom } from './project-store-sprite-sets.ts'
export type { ProjectStoreIo } from './project-store-persistence.ts'
export type { ProjectSyncSession } from './project-store-broadcast.ts'
export type { EntityLibraryChangeSource, ProjectStoreEvents, ProjectStoreNotice } from './project-store-events.ts'

/**
 * THE single write pipeline for project-level data — the one owner of:
 *
 *   - the active {@link LoadedProject} reference (controllers are
 *     lenses over it, they hold NO project copy of their own),
 *   - persistence of `game-project.json` + `spritesets/<id>.json`
 *     (atomic Gio writes via `project-store-persistence.ts`),
 *   - every `entityLibrary` / `playerActorId` mutation,
 *   - sprite-set CRUD (import / delete / rename / reorder / descriptor
 *     mutation) including the on-disk `<id>.png` + `<id>.json` pair,
 *   - the collab broadcast for all of the above
 *     (`project-store-broadcast.ts`), and
 *   - the application of inbound peer ops (the single-applier role) —
 *     {@link applyRemoteProjectOp} / {@link applyRemoteSpriteSetAdd} /
 *     {@link applyRemoteSpriteSetUpdate}.
 *
 * The class itself is the coordinator: it holds the state, the write
 * ORDER and the event emission. The decisions each step makes are pure
 * module functions in the three `project-store-*` siblings (data
 * transforms, wire construction, disk paths) so they unit-test without
 * a project, a session or a filesystem.
 *
 * Every mutation follows the same sequence: mutate the in-memory
 * `GameProjectData` (via the engine's idempotent `apply*` functions),
 * persist, broadcast (local mutations only — remote applies never
 * re-broadcast), then emit a typed change event. Routing both lenses
 * (Cast + Objects) and every other consumer through this one pipeline
 * makes "persisted but not broadcast" structurally impossible — the
 * drift class the anti-parallel-state rule exists to prevent.
 *
 * **Error policy — two families, deliberately different:**
 *
 * - `game-project.json` (entity library, player, metadata, sprite-set
 *   REFERENCES): best-effort. {@link _persistProject} toasts on failure
 *   but the in-memory state still updates, so the UI doesn't snap back
 *   on a transient disk error. The in-memory project is the source of
 *   truth for the whole open session.
 * - `spritesets/<id>.json` (descriptor CONTENT — name, animations, tile
 *   properties): write-then-commit via {@link _commitSpriteSet}. The
 *   next descriptor is built as a detached object, serialised + written
 *   FIRST, and only replaces the live one once the write succeeded.
 *   A rejected or unwritable edit therefore persists nothing,
 *   broadcasts nothing and emits nothing. Broadcasting a descriptor we
 *   could not save would put peers and disk permanently out of step,
 *   and this path is reachable from an inbound peer chunk, not just
 *   from local UI.
 *
 * Every descriptor write path goes through {@link _commitSpriteSet} —
 * a new one that hand-rolls its own persist re-opens the exact drift
 * this class exists to prevent. `project-store.spec.ts` keeps a
 * table-driven guard over that family; extend it with the path.
 */
export class ProjectStore {
  private _project: LoadedProject | null = null
  /**
   * Active collab session, when one is live. Set by the host window on
   * session start/stop. While set, every local mutation also broadcasts
   * the matching `__project/*` op so peers stay in sync; inbound ops
   * arrive via the sinks registered in {@link setCollabSession}. Null in
   * solo editing (the common case) — then mutations only persist locally.
   */
  private _session: ProjectSyncSession | null = null
  private readonly _events = new TypedEmitter<ProjectStoreEvents>()

  constructor(private readonly io: ProjectStoreIo = DEFAULT_PROJECT_STORE_IO) {}

  /** Subscribe to a store event. Returns an unsubscribe closure. */
  on<K extends keyof ProjectStoreEvents>(event: K, listener: (payload: ProjectStoreEvents[K]) => void): () => void {
    return this._events.on(event, listener)
  }

  /** The active project, or `null` when none is open. */
  get project(): LoadedProject | null {
    return this._project
  }

  /** The active project's engine resource (sprite-set / map lookups). */
  get resource(): LoadedProject['resource'] | null {
    return this._project?.resource ?? null
  }

  /** The active project's data, or `null` when none is open. */
  get data(): LoadedProject['resource']['data'] | null {
    return this._project?.resource?.data ?? null
  }

  /**
   * Swap the active project. Pass `null` to clear (e.g. when the user
   * closes the project). Lenses re-hydrate via `project-changed`.
   */
  setProject(project: LoadedProject | null): void {
    this._project = project
    this._events.emit('project-changed', project)
    // (Re)evaluate sink registration: on the joiner the session attaches
    // (setCollabSession) BEFORE the snapshot project finishes loading, so
    // the sinks must be (re)registered here once a project is present —
    // that drains any project ops the session buffered in the meantime.
    this._refreshSessionSinks()
  }

  /**
   * Attach/detach the live collab session. While attached, mutations
   * broadcast to peers and the store registers itself as the single
   * applier of inbound project ops; detaching (null) returns to
   * local-only editing.
   */
  setCollabSession(session: ProjectSyncSession | null): void {
    this._session = session
    this._refreshSessionSinks()
  }

  /**
   * Register (or clear) the inbound project-op sinks on the active
   * session. Sinks are registered ONLY once a project is present so the
   * single-applier (`applyRemote*`) always has a `GameProjectData` to
   * mutate; until then inbound ops stay buffered in the session and drain
   * the moment the sink is assigned. Symmetric: with no project (or no
   * session) the sinks are cleared, returning the session to buffering.
   */
  private _refreshSessionSinks(): void {
    if (!this._session) return
    bindProjectSinks(
      this._session,
      this._project
        ? {
            projectOp: (op) => this.applyRemoteProjectOp(op),
            spriteSetAdd: (payload) => this.applyRemoteSpriteSetAdd(payload),
            spriteSetUpdate: (payload) => this.applyRemoteSpriteSetUpdate(payload),
          }
        : null,
    )
  }

  // ────────────────────────────────────────────────────────────
  // Entity library (+ player)
  // ────────────────────────────────────────────────────────────

  /** Every entity definition in the project library. */
  entities(): EntityDefinition[] {
    return this.data?.entityLibrary ?? []
  }

  /** The entity definition with the given id, or `null`. */
  findEntity(id: string): EntityDefinition | null {
    return findEntityById(this.entities(), id)
  }

  /** Project ref-picker options (maps + appearance sheets) for the component inspectors. */
  refOptions(): { maps: RefOption[]; appearances: RefOption[] } {
    const resource = this.resource
    return buildRefOptions(resource?.data?.maps, resource?.spriteSets)
  }

  /**
   * Replace-or-append an entity in `entityLibrary`: persist + broadcast
   * a `__project/entity.upsert` + notify. The single write path for
   * every create / rename / component edit from either lens.
   */
  upsertEntity(entity: EntityDefinition, source: EntityLibraryChangeSource): void {
    const data = this.data
    if (!data) return
    applyEntityUpsert(data, entity)
    this._persistProject()
    broadcastEntityUpsert(this._session, entity)
    this._events.emit('entity-library-changed', { source })
  }

  /**
   * Drop an entity from `entityLibrary` (also clears `playerActorId`
   * when it was the player): persist + broadcast a
   * `__project/entity.remove` + notify. Returns `false` for an unknown
   * id (nothing mutated, persisted or broadcast).
   */
  removeEntity(entityId: string, source: EntityLibraryChangeSource): boolean {
    const data = this.data
    if (!data || !findEntityById(data.entityLibrary ?? [], entityId)) return false
    applyEntityRemove(data, entityId)
    this._persistProject()
    broadcastEntityRemove(this._session, entityId)
    this._events.emit('entity-library-changed', { source })
    return true
  }

  /** Write + broadcast `playerActorId` (`null` clears it) + notify. */
  setPlayerActor(playerActorId: string | null, source: EntityLibraryChangeSource): void {
    const data = this.data
    if (!data) return
    applyPlayerSet(data, playerActorId)
    this._persistProject()
    broadcastPlayerSet(this._session, playerActorId)
    this._events.emit('entity-library-changed', { source })
  }

  // ────────────────────────────────────────────────────────────
  // Project metadata
  // ────────────────────────────────────────────────────────────

  /**
   * Persist + broadcast the project's metadata (name + the whole
   * `properties` bag) after the Data view edited it in place. Coarse
   * broadcast so the receiver replaces wholesale (idempotent, mirrors
   * `entity.upsert`). Local-only edits do NOT emit `project-meta-changed`
   * — the editing view already shows the value; the event is for
   * inbound peer updates.
   */
  commitProjectMeta(): void {
    const data = this.data
    if (!data) return
    this._persistProject()
    if (!data.properties) data.properties = {}
    broadcastProjectMeta(this._session, data.name, data.properties)
  }

  // ────────────────────────────────────────────────────────────
  // Remote-op application (single applier)
  // ────────────────────────────────────────────────────────────

  /**
   * Apply an inbound project op from a peer: mutate the in-memory
   * `GameProjectData`, persist, and emit the matching change event so
   * every lens re-hydrates. Does NOT re-broadcast (no loopback).
   * Idempotent — the engine's `apply*` functions replace-by-id.
   */
  applyRemoteProjectOp(op: ProjectOp): void {
    const data = this.data
    if (!data) return
    if (applyEntityLibraryOp(data, op)) {
      this._persistProject()
      this._events.emit('entity-library-changed', { source: 'remote' })
    } else if (op.kind === SPRITESET_REMOVE_KIND) {
      this._applyRemoteSpriteSetRemove(op.payload.spriteSetId)
    } else if (op.kind === PROJECT_META_UPDATE_KIND) {
      this._applyRemoteProjectMeta(data, op.payload)
    } else if (op.kind === MAP_EDITOR_DATA_KIND) {
      this._applyRemoteMapEditorData(op.payload)
    }
  }

  /**
   * Coarse replace of name + the whole properties bag; persist the
   * project JSON, then let the Data view (the surface that renders these
   * fields) re-hydrate.
   */
  private _applyRemoteProjectMeta(data: GameProjectData, payload: ProjectMetaUpdateOp['payload']): void {
    applyProjectMetaUpdate(data, payload)
    this._persistProject()
    this._events.emit('project-meta-changed', undefined)
  }

  /**
   * Shallow-merge the patch onto the matching map's `editorData`.
   * Map-file persistence + atlas refresh belong to the host (the owner
   * of map IO) — hand it the patched map's id.
   */
  private _applyRemoteMapEditorData(payload: MapEditorDataOp['payload']): void {
    const maps = this.resource?.maps
    if (!maps) return
    const mapDatas = [...maps.values()].flatMap((m) => (m.mapData ? [m.mapData] : []))
    if (applyMapEditorData(mapDatas, payload)) {
      this._events.emit('map-editor-data-changed', { mapId: payload.mapId })
    }
  }

  /**
   * Apply an inbound sprite-set removal from a peer: drop the reference,
   * delete the local `<id>.png` + `<id>.json`, evict the live resource,
   * persist, and notify. Idempotent. Does NOT re-broadcast.
   */
  private _applyRemoteSpriteSetRemove(id: string): void {
    const resource = this.resource
    if (!resource?.data?.spriteSets?.some((s) => s.id === id)) return
    this._removeSpriteSetFiles(id)
    applySpriteSetRemove(resource.data, id)
    resource.spriteSets.delete(id)
    this._persistProject()
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
  }

  /**
   * Apply an inbound sprite-set import from a peer: write the image +
   * descriptor into this project's `spritesets/`, register the
   * reference (keeping the sender's id so characters that reference it
   * still resolve), load it live, persist, and notify. Idempotent —
   * re-applying overwrites the same files + replaces the ref by id.
   */
  applyRemoteSpriteSetAdd(payload: SpriteSetAddPayload): void {
    const resource = this.resource
    if (!resource?.data) return
    const id = payload.data.id
    // SECURITY: `id` is peer-supplied and feeds filesystem paths. The
    // path builder is gated on `isPlainFilename` so a malicious peer
    // can't escape `spritesets/` (path traversal). We also DERIVE the
    // image filename from the validated id rather than trusting the
    // peer's `image.path`, and normalise the descriptor to match — so
    // the only peer string that touches the FS is the vetted id.
    const paths = this._spriteSetPaths(id)
    if (!paths) {
      console.warn('[ProjectStore] Rejected peer sprite-set with unsafe id:', id)
      return
    }
    if (!this.io.writeBinary(paths.image, GLib.base64_decode(payload.imageBase64))) {
      console.warn('[ProjectStore] Failed to write peer sprite-set image:', paths.image)
      return
    }
    writeSpriteSetDescriptor(this.io, paths.descriptor, withImagePath(payload.data, paths.imageFile))
    // gid space is per-peer; the sender's value may collide with ours, so we
    // assign our own. On re-apply REUSE the existing firstGid — recomputing
    // would shift it (once the set's sprites are loaded `_nextFirstGid` counts
    // this set too), breaking the documented idempotency and the tile-id space.
    const existingRef = resource.data.spriteSets.find((r) => r.id === id)
    const firstGid = typeof existingRef?.firstGid === 'number' ? existingRef.firstGid : this._nextFirstGid()
    applySpriteSetReference(resource.data, {
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset',
      firstGid,
    })
    this._persistProject()
    void (async () => {
      await this._loadSpriteSetLive(paths.descriptor, id, 'Peer')
      this._events.emit('sprite-sets-changed', { spriteSetId: id })
    })()
  }

  /**
   * Apply an inbound sprite-set DESCRIPTOR update from a peer: overwrite
   * the descriptor JSON + the live in-memory data and notify — galleries
   * re-hydrate via `sprite-sets-changed` and live engine collision via
   * `tile-properties-changed`. `applySpriteSetUpdate` keeps the LOCAL
   * image descriptor (the `<id>.png` bytes are unchanged — only metadata
   * moved) so a peer can't repoint our image. Ignored when we don't
   * already have the set (adds come via {@link applyRemoteSpriteSetAdd})
   * or the id is unsafe. Does NOT re-broadcast.
   *
   * Rides {@link _commitSpriteSet}, so a peer chunk this project cannot
   * serialise or write leaves the local descriptor untouched instead of
   * replacing it and swallowing the change event.
   */
  applyRemoteSpriteSetUpdate(payload: SpriteSetUpdatePayload): void {
    const id = payload.data.id
    if (!isPlainFilename(id)) {
      console.warn('[ProjectStore] Rejected peer sprite-set update with unsafe id:', id)
      return
    }
    if (!this._commitSpriteSet(id, (current) => applySpriteSetUpdate(current, payload))) return
    this._events.emit('tile-properties-changed', { spriteSetId: id })
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
  }

  // ────────────────────────────────────────────────────────────
  // Sprite-set CRUD
  // ────────────────────────────────────────────────────────────

  /**
   * Import a sprite set into the project: finalise a unique id + a
   * non-overlapping `firstGid`, copy the source image into
   * `spritesets/<id>.png`, write `spritesets/<id>.json`, register the
   * reference in `game-project.json`, and load it into the live
   * resource map so it's usable without reopening the project. Returns
   * the new set as a {@link SpriteSetChoice} for the character dialog to
   * select, or `null` if the copy/write failed. Broadcasts the set to
   * peers (chunked — carries the image bytes).
   */
  async importSpriteSet({ data, sourcePath }: SpriteSetImportResult): Promise<SpriteSetChoice | null> {
    const resource = this.resource
    if (!resource?.data) return null
    const id = uniqueIdFrom(data.id, new Set(resource.spriteSets.keys()))
    const paths = spriteSetPaths(resource.path, id)
    const finalData = buildImportedSpriteSetData(data, id, paths.imageFile)

    if (!this.io.copy(sourcePath, paths.image)) {
      this._events.emit('notice', { kind: 'image-copy-failed' })
      return null
    }
    if (!writeSpriteSetDescriptor(this.io, paths.descriptor, finalData)) {
      this._events.emit('notice', { kind: 'sprite-set-save-failed' })
      return null
    }

    resource.data.spriteSets.push({
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset',
      firstGid: this._nextFirstGid(),
    })
    this._persistProject()
    await this._loadSpriteSetLive(paths.descriptor, id, 'Imported')
    // Sync to peers (chunked — carries the image bytes). Best-effort:
    // a read failure just means peers won't get this set live.
    if (this._session) {
      const bytes = this.io.readBinary(paths.image)
      if (bytes) broadcastSpriteSetAdd(this._session, finalData, GLib.base64_encode(bytes))
    }
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
    this._events.emit('notice', { kind: 'sprite-set-imported', name: finalData.name })
    return { id, name: finalData.name }
  }

  /**
   * Delete a sprite set from the project: drop its reference, delete
   * the `<id>.png` + `<id>.json` files, evict the live resource,
   * persist, broadcast a `__project/spriteset.remove`, and notify.
   * No-op for an unknown id. Built-in sets (`built-in:*`, which have no
   * project files) are guarded by the caller — the Sheets view never
   * offers a delete affordance for them.
   */
  deleteSpriteSet(id: string): void {
    const resource = this.resource
    if (!resource?.data?.spriteSets?.some((s) => s.id === id)) return
    this._removeSpriteSetFiles(id)
    applySpriteSetRemove(resource.data, id)
    resource.spriteSets.delete(id)
    this._persistProject()
    broadcastSpriteSetRemove(this._session, id)
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
  }

  /**
   * Rename a sprite set's display name (the `name` in its
   * `spritesets/<id>.json`). Works for both a character sheet and a
   * world tileset — the single owner of the file write + collab
   * broadcast. Persists, broadcasts a descriptor update so peers rename
   * too, and notifies so every view re-hydrates. No-op on a blank name,
   * an unchanged name, an unknown id, or a failed write.
   */
  renameSpriteSet(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    const renamed = this._commitSpriteSet(id, (current) =>
      current.name === trimmed ? null : { ...current, name: trimmed },
    )
    if (!renamed) return
    this._broadcastSpriteSetUpdate(id)
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
  }

  /**
   * Rewrite the project's `spriteSets[]` reference order to match
   * `orderedIds` (the Sheets gallery's display order after a drag).
   * References whose id isn't in the list keep their relative order at
   * the end (stable). Persists + notifies. **Local + cosmetic — NOT
   * broadcast over collab**: order carries no editing state, so a
   * peer's gallery order is independent (new joiners still get the
   * host's order via the project snapshot). No-op when the order is
   * already current.
   */
  reorderSpriteSets(orderedIds: string[]): void {
    const data = this.data
    if (!data?.spriteSets) return
    const sorted = orderSpriteSetReferences(data.spriteSets, orderedIds)
    if (!sorted) return
    data.spriteSets = sorted
    this._persistProject()
    this._events.emit('sprite-sets-changed', {})
  }

  /**
   * Apply a closure to a DRAFT of a sprite set's descriptor data, then
   * persist the descriptor JSON + broadcast a chunked
   * `__project/spriteset.update.chunk` so peers pick the change up. The
   * one write+broadcast path for descriptor content edits (animations).
   * Deliberately does NOT emit `sprite-sets-changed` — the initiating
   * lens refreshes itself; the set LIST didn't change.
   *
   * `mutator` receives a detached copy and returns `false` to REJECT the
   * edit. A rejected edit persists nothing and broadcasts nothing — a
   * local no-op must never ship a full-sheet upsert that clobbers a
   * peer's concurrent edit with stale data. Returns whether the
   * descriptor actually changed (`false` for an unknown id, a rejected
   * mutation, or a failed write).
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: the everyday mutator is a void-returning block (`(d) => { d.name = x }`), which `boolean | undefined` would reject; only an explicit `false` means "rejected"
  mutateSpriteSetData(spriteSetId: string, mutator: (data: SpriteSetData) => boolean | void): boolean {
    const changed = this._commitSpriteSet(spriteSetId, (current) => {
      const draft = draftSpriteSetData(current)
      return mutator(draft) === false ? null : draft
    })
    if (!changed) return false
    this._broadcastSpriteSetUpdate(spriteSetId)
    return true
  }

  /** Set a tile's Solid flag on a sprite-set descriptor (persist + broadcast + notify collision). */
  setTileSolid(spriteSetId: string, spriteId: number, solid: boolean): void {
    this._mutateSpriteTile(spriteSetId, spriteId, (def) => {
      def.solid = solid
    })
  }

  /** Set / clear a tile's surface kind (`tileProperties.surface`) on a sprite-set descriptor. */
  setTileSurface(spriteSetId: string, spriteId: number, surface: string | null): void {
    this._mutateSpriteTile(spriteSetId, spriteId, (def) => writeTileSurface(def, surface))
  }

  /**
   * Apply a closure to a single sprite definition in a sprite set, then
   * persist the descriptor JSON, broadcast the descriptor update, and
   * emit `tile-properties-changed` so live engine collision refreshes
   * (when a scene is open). One write+broadcast path for every
   * tile-property editor. No-op for an unknown set / sprite id or a
   * failed write.
   */
  private _mutateSpriteTile(
    spriteSetId: string,
    spriteId: number,
    mutator: (def: SpriteSetData['sprites'][number]) => void,
  ): void {
    const changed = this._commitSpriteSet(spriteSetId, (current) => {
      const draft = draftSpriteSetData(current)
      const def = draft.sprites.find((s) => s.id === spriteId)
      if (!def) return null
      mutator(def)
      return draft
    })
    if (!changed) return
    this._broadcastSpriteSetUpdate(spriteSetId)
    this._events.emit('tile-properties-changed', { spriteSetId })
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  /**
   * Broadcast a sprite set's current DESCRIPTOR to peers (rename /
   * animation edit / tile-prop change) — no image bytes, the peer already
   * has the image. No-op solo. Sent after the local persist so the wire
   * carries exactly what was saved.
   */
  private _broadcastSpriteSetUpdate(spriteSetId: string): void {
    const data = this.resource?.spriteSets.get(spriteSetId)?.data
    if (!data) return
    broadcastSpriteSetUpdate(this._session, data)
  }

  /**
   * Load a freshly-written descriptor into the live resource map so the
   * set is usable without reopening the project. Best-effort: a load
   * failure leaves the files + the reference in place, only the live
   * preview is missing until the project is reopened.
   */
  private async _loadSpriteSetLive(descriptorPath: string, id: string, origin: 'Peer' | 'Imported'): Promise<void> {
    const resource = this.resource
    if (!resource) return
    try {
      const engineSet = new SpriteSetResource(descriptorPath, { headless: false })
      await engineSet.load()
      resource.spriteSets.set(id, engineSet)
    } catch (err) {
      console.warn(`[ProjectStore] ${origin} sprite-set written but failed to load live:`, err)
    }
  }

  /**
   * Where a sprite set's files live in the OPEN project — `null` when
   * no project is open or the id could escape `spritesets/`. The one
   * gate every filesystem path for a (possibly peer-supplied) sprite-set
   * id passes through.
   */
  private _spriteSetPaths(id: string): SpriteSetPaths | null {
    const resource = this.resource
    if (!resource || !isPlainFilename(id)) return null
    return spriteSetPaths(resource.path, id)
  }

  /**
   * Delete the on-disk `<id>.png` + `<id>.json` of a project sprite set.
   * Best-effort — a failed delete doesn't abort the in-memory removal
   * (the reference is gone either way; an orphaned file is harmless).
   */
  private _removeSpriteSetFiles(id: string): void {
    const paths = this._spriteSetPaths(id)
    if (paths) deleteSpriteSetFiles(this.io, paths)
  }

  /** Next non-overlapping `firstGid` for a new sprite set in this project. */
  private _nextFirstGid(): number {
    const resource = this.resource
    if (!resource?.data) return 1
    return nextFirstGid(resource.data.spriteSets, (id) => resource.spriteSets.get(id)?.data?.sprites?.length ?? 0)
  }

  /**
   * The ONE write+commit step for a sprite-set descriptor
   * (`spritesets/<id>.json`) — every content edit goes through here.
   *
   * `next` receives the live descriptor and returns the DETACHED next
   * one, or `null` to reject the edit (unknown target, no-op, protected
   * role). The returned descriptor is serialised + written FIRST and
   * only then replaces `engineSet.data`, so neither a rejected edit nor
   * a `SpriteSetFormat.serialize` throw can leave the in-memory
   * descriptor ahead of the disk — the shape a per-call-site persist
   * kept getting wrong (and the throw escaped straight out of the
   * inbound-peer sink).
   *
   * Returns whether the descriptor changed. `false` means: persisted
   * nothing — so the caller must not broadcast and must not emit.
   */
  private _commitSpriteSet(spriteSetId: string, next: (current: SpriteSetData) => SpriteSetData | null): boolean {
    const engineSet = this.resource?.spriteSets.get(spriteSetId)
    if (!engineSet?.data) return false
    const paths = this._spriteSetPaths(spriteSetId)
    if (!paths) return false
    const committed = next(engineSet.data)
    if (!committed) return false
    if (!writeSpriteSetDescriptor(this.io, paths.descriptor, committed)) {
      this._events.emit('notice', { kind: 'sprite-set-save-failed' })
      return false
    }
    engineSet.data = committed
    return true
  }

  /**
   * Serialise the in-memory `GameProjectData` back to disk. Best-
   * effort — failures toast but the in-memory state still updates so
   * the UI doesn't snap back to old values.
   */
  private _persistProject(): void {
    const resource = this.resource
    if (!resource?.data) return
    if (!writeProjectData(this.io, resource.path, resource.data)) {
      this._events.emit('notice', { kind: 'project-save-failed' })
    }
  }
}
