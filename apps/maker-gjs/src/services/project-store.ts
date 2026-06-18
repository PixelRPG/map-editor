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
  createEntityRemoveOp,
  createEntityUpsertOp,
  createPlayerSetOp,
  createProjectMetaUpdateOp,
  createSpriteSetRemoveOp,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  type EntityDefinition,
  GameProjectFormat,
  MAP_EDITOR_DATA_KIND,
  PLAYER_SET_KIND,
  PROJECT_META_UPDATE_KIND,
  type ProjectOp,
  REQUIRED_ROLES,
  SPRITESET_REMOVE_KIND,
  type SpriteSetAddPayload,
  type SpriteSetData,
  SpriteSetFormat,
  SpriteSetResource,
  type SpriteSetUpdatePayload,
} from '@pixelrpg/engine'
import type { SpriteSetChoice, SpriteSetImportResult } from '@pixelrpg/gjs'
import { copyFile, deleteFile, readBinaryFile, writeBinaryFile, writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'
import { TypedEmitter } from './typed-emitter.ts'

/** Default per-frame duration (ms) seeded into a new character sheet's animations. */
const DEFAULT_ANIMATION_MS = 200
/** Default frame index seeded into every required animation role. */
const DEFAULT_FRAME = 0

/**
 * True when `name` is a plain single-path-segment filename — no path
 * separators, no `..`, no NUL. Used to vet a peer-supplied sprite-set
 * id before it's used to build filesystem paths, so a malicious peer
 * can't write outside the project's `spritesets/` directory.
 */
function isPlainFilename(name: string): boolean {
  return name.length > 0 && !/[\\/]/.test(name) && !name.includes('..') && !name.includes('\0')
}

/**
 * Lowest unused id derived from `name` (`hero`, `hero-2`, `hero-3`, …).
 * Falls back to `fallback` when the name slugs to nothing.
 */
export function uniqueIdFrom(name: string, taken: ReadonlySet<string>, fallback = 'item'): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

/**
 * Which local surface initiated an entity-library mutation. Lenses use
 * it to skip re-hydrating themselves for edits they originated (their
 * view already reflects the change optimistically) while every OTHER
 * lens refreshes. `'remote'` (an inbound peer op) refreshes everyone.
 */
export type EntityLibraryChangeSource = 'cast' | 'objects' | 'remote'

/** Typed event map for {@link ProjectStore.on}. */
/**
 * User-facing notification from the store. The store is UI-free (it also
 * runs in the node test bundle, where GJS's `gettext` builtin does not
 * exist), so it emits semantic notices and the window translates +
 * toasts them — the same pattern `SessionService` uses for its toasts.
 */
export type ProjectStoreNotice =
  | { kind: 'image-copy-failed' }
  | { kind: 'sprite-set-save-failed' }
  | { kind: 'project-save-failed' }
  | { kind: 'sprite-set-imported'; name: string }

export interface ProjectStoreEvents {
  /** A user-facing notice — the host translates + shows it as a toast. */
  notice: ProjectStoreNotice
  /** The active project was swapped (or cleared with `null`). */
  'project-changed': LoadedProject | null
  /** `entityLibrary` / `playerActorId` changed (local mutation or inbound peer op). */
  'entity-library-changed': { source: EntityLibraryChangeSource }
  /**
   * The sprite-set list or a set's descriptor changed (import / delete /
   * rename / reorder / inbound peer add, remove or update). `spriteSetId`
   * names the affected set when the change is per-set; absent for
   * list-order changes.
   */
  'sprite-sets-changed': { spriteSetId?: string }
  /**
   * A sprite-set descriptor's tile properties changed — a local Solid /
   * Surface edit or an inbound peer descriptor update — so the host can
   * refresh live engine collision when a scene is open.
   */
  'tile-properties-changed': { spriteSetId: string }
  /**
   * An inbound `__project/meta.update` landed on the project data
   * (name / author / version / description / `defaultTileSize`).
   */
  'project-meta-changed': undefined
  /**
   * An inbound `__project/map.editor-data` patched a map's `editorData`
   * (today: atlas card position). The host — the owner of map-file IO —
   * persists that map + refreshes the atlas.
   */
  'map-editor-data-changed': { mapId: string }
}

/**
 * The slice of `CollabSession` the store drives: outbound project-op /
 * sprite-set broadcast plus the inbound sinks the store registers
 * itself on. Structural so tests can pass an in-memory fake without
 * constructing a real WebRTC session.
 */
export interface ProjectSyncSession {
  sendProjectOp(build: (ctx: { peerId: string; seq: number }) => ProjectOp): void
  sendSpriteSetAdd(payload: SpriteSetAddPayload): void
  sendSpriteSetUpdate(payload: SpriteSetUpdatePayload): void
  onProjectOpReceived: ((op: ProjectOp) => void) | null
  onSpriteSetAddReceived: ((payload: SpriteSetAddPayload) => void) | null
  onSpriteSetUpdateReceived: ((payload: SpriteSetUpdatePayload) => void) | null
}

/** Injectable file-IO seam (defaults to the shared Gio helpers) so specs can record writes. */
export interface ProjectStoreIo {
  writeText: typeof writeTextFile
  writeBinary: typeof writeBinaryFile
  copy: typeof copyFile
  readBinary: typeof readBinaryFile
  remove: typeof deleteFile
}

const DEFAULT_IO: ProjectStoreIo = {
  writeText: writeTextFile,
  writeBinary: writeBinaryFile,
  copy: copyFile,
  readBinary: readBinaryFile,
  remove: deleteFile,
}

/**
 * THE single write pipeline for project-level data — the one owner of:
 *
 *   - the active {@link LoadedProject} reference (controllers are
 *     lenses over it, they hold NO project copy of their own),
 *   - persistence of `game-project.json` + `spritesets/<id>.json`
 *     (atomic Gio writes via the shared file-io helpers),
 *   - every `entityLibrary` / `playerActorId` mutation,
 *   - sprite-set CRUD (import / delete / rename / reorder / descriptor
 *     mutation) including the on-disk `<id>.png` + `<id>.json` pair,
 *   - the collab broadcast for all of the above (`sendProjectOp` +
 *     the chunked sprite-set channels), and
 *   - the application of inbound peer ops (the single-applier role) —
 *     {@link applyRemoteProjectOp} / {@link applyRemoteSpriteSetAdd} /
 *     {@link applyRemoteSpriteSetUpdate}.
 *
 * Every mutation follows the same sequence: mutate the in-memory
 * `GameProjectData` (via the engine's idempotent `apply*` functions),
 * persist, broadcast (local mutations only — remote applies never
 * re-broadcast), then emit a typed change event. Routing both lenses
 * (Cast + Objects) and every other consumer through this one pipeline
 * makes "persisted but not broadcast" structurally impossible — the
 * drift class the anti-parallel-state rule exists to prevent.
 *
 * Error policy: persistence is best-effort — failures toast but the
 * in-memory state still updates so the UI doesn't snap back.
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

  constructor(private readonly io: ProjectStoreIo = DEFAULT_IO) {}

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
    const session = this._session
    if (!session) return
    if (this._project) {
      session.onProjectOpReceived = (op) => this.applyRemoteProjectOp(op)
      session.onSpriteSetAddReceived = (payload) => this.applyRemoteSpriteSetAdd(payload)
      session.onSpriteSetUpdateReceived = (payload) => this.applyRemoteSpriteSetUpdate(payload)
    } else {
      session.onProjectOpReceived = null
      session.onSpriteSetAddReceived = null
      session.onSpriteSetUpdateReceived = null
    }
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
    return this.entities().find((e) => e.id === id) ?? null
  }

  /** Project ref-picker options (maps + appearance sheets) for the component inspectors. */
  refOptions(): { maps: { value: string; label: string }[]; appearances: { value: string; label: string }[] } {
    const resource = this.resource
    return {
      maps: (resource?.data?.maps ?? []).map((m) => ({ value: m.id, label: m.name ?? m.id })),
      appearances: resource?.spriteSets
        ? [...resource.spriteSets.entries()].map(([id, set]) => ({ value: id, label: set.data?.name ?? id }))
        : [],
    }
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
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityUpsertOp({ peerId, seq, entity }))
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
    if (!data?.entityLibrary?.some((e) => e.id === entityId)) return false
    applyEntityRemove(data, entityId)
    this._persistProject()
    this._session?.sendProjectOp(({ peerId, seq }) => createEntityRemoveOp({ peerId, seq, entityId }))
    this._events.emit('entity-library-changed', { source })
    return true
  }

  /** Write + broadcast `playerActorId` (`null` clears it) + notify. */
  setPlayerActor(playerActorId: string | null, source: EntityLibraryChangeSource): void {
    const data = this.data
    if (!data) return
    applyPlayerSet(data, playerActorId)
    this._persistProject()
    this._session?.sendProjectOp(({ peerId, seq }) => createPlayerSetOp({ peerId, seq, playerActorId }))
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
    const properties = data.properties
    this._session?.sendProjectOp(({ peerId, seq }) =>
      createProjectMetaUpdateOp({ peerId, seq, name: data.name, properties }),
    )
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
    if (op.kind === ENTITY_UPSERT_KIND) {
      applyEntityUpsert(data, op.payload.entity)
    } else if (op.kind === ENTITY_REMOVE_KIND) {
      applyEntityRemove(data, op.payload.entityId)
    } else if (op.kind === PLAYER_SET_KIND) {
      applyPlayerSet(data, op.payload.playerActorId)
    } else if (op.kind === SPRITESET_REMOVE_KIND) {
      this._applyRemoteSpriteSetRemove(op.payload.spriteSetId)
      return
    } else if (op.kind === PROJECT_META_UPDATE_KIND) {
      // Coarse replace of name + the whole properties bag; persist the
      // project JSON, then let the Data view (the surface that renders
      // these fields) re-hydrate.
      applyProjectMetaUpdate(data, op.payload)
      this._persistProject()
      this._events.emit('project-meta-changed', undefined)
      return
    } else if (op.kind === MAP_EDITOR_DATA_KIND) {
      // Shallow-merge the patch onto the matching map's `editorData`.
      // Map-file persistence + atlas refresh belong to the host (the
      // owner of map IO) — hand it the patched map's id.
      const maps = this.resource?.maps
      if (!maps) return
      const mapDatas = [...maps.values()].flatMap((m) => (m.mapData ? [m.mapData] : []))
      if (applyMapEditorData(mapDatas, op.payload)) {
        this._events.emit('map-editor-data-changed', { mapId: op.payload.mapId })
      }
      return
    } else {
      return
    }
    this._persistProject()
    this._events.emit('entity-library-changed', { source: 'remote' })
  }

  /**
   * Apply an inbound sprite-set removal from a peer: drop the reference,
   * delete the local `<id>.png` + `<id>.json`, evict the live resource,
   * persist, and notify. Idempotent. Does NOT re-broadcast.
   */
  private _applyRemoteSpriteSetRemove(id: string): void {
    const resource = this.resource
    if (!resource?.data) return
    if (!resource.data.spriteSets?.some((s) => s.id === id)) return
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
    const { data } = payload
    const id = data.id
    // SECURITY: `id` is peer-supplied and feeds filesystem paths below.
    // Reject anything that isn't a plain filename so a malicious peer
    // can't escape `spritesets/` (path traversal). We also DERIVE the
    // image filename from the validated id rather than trusting the
    // peer's `image.path`, and normalise the descriptor to match — so
    // the only peer string that touches the FS is the vetted id.
    if (!isPlainFilename(id)) {
      console.warn('[ProjectStore] Rejected peer sprite-set with unsafe id:', id)
      return
    }
    const imageFile = `${id}.png`
    const safeData: typeof data = {
      ...data,
      image: { ...(data.image ?? { id: 'main', type: 'image' }), path: imageFile },
    }
    const projectDir = GLib.path_get_dirname(resource.path)
    const pngDest = GLib.build_filenamev([projectDir, 'spritesets', imageFile])
    const jsonDest = GLib.build_filenamev([projectDir, 'spritesets', `${id}.json`])

    if (!this.io.writeBinary(pngDest, GLib.base64_decode(payload.imageBase64))) {
      console.warn('[ProjectStore] Failed to write peer sprite-set image:', pngDest)
      return
    }
    this.io.writeText(jsonDest, SpriteSetFormat.serialize(safeData))
    applySpriteSetReference(resource.data, {
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset',
      // Recompute on our side — gid space is per-peer; the sender's
      // value may collide with ours.
      firstGid: this._nextFirstGid(),
    })
    this._persistProject()
    void (async () => {
      try {
        const engineSet = new SpriteSetResource(jsonDest, { headless: false })
        await engineSet.load()
        resource.spriteSets.set(id, engineSet)
      } catch (err) {
        console.warn('[ProjectStore] Peer sprite-set written but failed to load live:', err)
      }
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
   */
  applyRemoteSpriteSetUpdate(payload: SpriteSetUpdatePayload): void {
    const resource = this.resource
    const engineSet = resource?.spriteSets.get(payload.data.id)
    if (!resource || !engineSet?.data) return
    if (!isPlainFilename(payload.data.id)) {
      console.warn('[ProjectStore] Rejected peer sprite-set update with unsafe id:', payload.data.id)
      return
    }
    engineSet.data = applySpriteSetUpdate(engineSet.data, payload)
    this._persistSpriteSet(payload.data.id)
    this._events.emit('tile-properties-changed', { spriteSetId: payload.data.id })
    this._events.emit('sprite-sets-changed', { spriteSetId: payload.data.id })
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
    const imageFile = `${id}.png`
    const kind = data.kind ?? ('tileset' as const)
    const finalData = {
      ...data,
      id,
      // The dialog tags the set by kind ('character' sheet vs 'tileset')
      // so it surfaces in the right gallery; default to tileset if absent.
      kind,
      // A character sheet OWNS its animations — seed the 8 required roles
      // (single placeholder frame) so a character using it can animate
      // immediately; the user refines frames in the sheet's editor.
      characterAnimations:
        kind === 'character'
          ? (data.characterAnimations ??
            REQUIRED_ROLES.map((role) => ({ id: role, frames: [DEFAULT_FRAME], durationMs: DEFAULT_ANIMATION_MS })))
          : undefined,
      image: { ...(data.image ?? { id: 'main', type: 'image' as const }), path: imageFile },
    }

    const projectDir = GLib.path_get_dirname(resource.path)
    const pngDest = GLib.build_filenamev([projectDir, 'spritesets', imageFile])
    const jsonDest = GLib.build_filenamev([projectDir, 'spritesets', `${id}.json`])

    if (!this.io.copy(sourcePath, pngDest)) {
      this._events.emit('notice', { kind: 'image-copy-failed' })
      return null
    }
    if (!this.io.writeText(jsonDest, SpriteSetFormat.serialize(finalData))) {
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

    // Register into the live resource map so the character dialog's
    // preview + the cast view resolve it immediately (no reopen).
    try {
      const engineSet = new SpriteSetResource(jsonDest, { headless: false })
      await engineSet.load()
      resource.spriteSets.set(id, engineSet)
    } catch (err) {
      console.warn('[ProjectStore] Imported set written but failed to load live:', err)
    }
    // Sync to peers (chunked — carries the image bytes). Best-effort:
    // a read failure just means peers won't get this set live.
    if (this._session) {
      const bytes = this.io.readBinary(pngDest)
      if (bytes) this._session.sendSpriteSetAdd({ data: finalData, imageBase64: GLib.base64_encode(bytes) })
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
    if (!resource?.data) return
    if (!resource.data.spriteSets?.some((s) => s.id === id)) return
    this._removeSpriteSetFiles(id)
    applySpriteSetRemove(resource.data, id)
    resource.spriteSets.delete(id)
    this._persistProject()
    this._session?.sendProjectOp(({ peerId, seq }) => createSpriteSetRemoveOp({ peerId, seq, spriteSetId: id }))
    this._events.emit('sprite-sets-changed', { spriteSetId: id })
  }

  /**
   * Rename a sprite set's display name (the `name` in its
   * `spritesets/<id>.json`). Works for both a character sheet and a
   * world tileset — the single owner of the file write + collab
   * broadcast. Persists, broadcasts a descriptor update so peers rename
   * too, and notifies so every view re-hydrates. No-op on a blank name
   * or an unknown id.
   */
  renameSpriteSet(id: string, name: string): void {
    const engineSet = this.resource?.spriteSets.get(id)
    const trimmed = name.trim()
    if (!engineSet?.data || !trimmed) return
    if (engineSet.data.name === trimmed) return
    engineSet.data.name = trimmed
    this._persistSpriteSet(id)
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
    const rank = (id: string): number => {
      const i = orderedIds.indexOf(id)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const sorted = [...data.spriteSets].sort((a, b) => rank(a.id) - rank(b.id))
    if (sorted.every((ref, i) => ref === data.spriteSets[i])) return
    data.spriteSets = sorted
    this._persistProject()
    this._events.emit('sprite-sets-changed', {})
  }

  /**
   * Apply a closure to a sprite set's live descriptor data, then persist
   * the descriptor JSON + broadcast a chunked
   * `__project/spriteset.update.chunk` so peers pick the change up. The
   * one write+broadcast path for descriptor content edits (animations).
   * Deliberately does NOT emit `sprite-sets-changed` — the initiating
   * lens refreshes itself; the set LIST didn't change. Returns `false`
   * for an unknown id.
   */
  mutateSpriteSetData(spriteSetId: string, mutator: (data: SpriteSetData) => void): boolean {
    const engineSet = this.resource?.spriteSets.get(spriteSetId)
    if (!engineSet?.data) return false
    mutator(engineSet.data)
    this._persistSpriteSet(spriteSetId)
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
    this._mutateSpriteTile(spriteSetId, spriteId, (def) => {
      if (surface) {
        def.tileProperties = { ...(def.tileProperties ?? {}), surface }
      } else if (def.tileProperties?.surface !== undefined) {
        const next = { ...def.tileProperties }
        delete next.surface
        def.tileProperties = Object.keys(next).length === 0 ? undefined : next
      }
    })
  }

  /**
   * Apply a closure to a single sprite definition in a sprite set, then
   * persist the descriptor JSON, broadcast the descriptor update, and
   * emit `tile-properties-changed` so live engine collision refreshes
   * (when a scene is open). One write+broadcast path for every
   * tile-property editor.
   */
  private _mutateSpriteTile(
    spriteSetId: string,
    spriteId: number,
    mutator: (def: SpriteSetData['sprites'][number]) => void,
  ): void {
    const engineSet = this.resource?.spriteSets.get(spriteSetId)
    const def = engineSet?.data?.sprites.find((s) => s.id === spriteId)
    if (!def) return
    mutator(def)
    this._persistSpriteSet(spriteSetId)
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
    const session = this._session
    if (!session) return
    const data = this.resource?.spriteSets.get(spriteSetId)?.data
    if (!data) return
    session.sendSpriteSetUpdate({ data })
  }

  /**
   * Delete the on-disk `<id>.png` + `<id>.json` of a project sprite set.
   * Best-effort — a failed delete logs but doesn't abort the in-memory
   * removal (the reference is gone either way; an orphaned file is
   * harmless).
   */
  private _removeSpriteSetFiles(id: string): void {
    const resource = this.resource
    if (!resource) return
    if (!isPlainFilename(id)) return
    const projectDir = GLib.path_get_dirname(resource.path)
    this.io.remove(GLib.build_filenamev([projectDir, 'spritesets', `${id}.png`]))
    this.io.remove(GLib.build_filenamev([projectDir, 'spritesets', `${id}.json`]))
  }

  /**
   * Next non-overlapping `firstGid` for a new sprite set: one past the
   * highest global tile id any existing set occupies. Keeps the
   * imported set usable as a tileset later without gid collisions.
   */
  private _nextFirstGid(): number {
    const resource = this.resource
    if (!resource?.data) return 1
    let next = 1
    for (const ref of resource.data.spriteSets) {
      const count = resource.spriteSets.get(ref.id)?.data?.sprites?.length ?? 0
      const start = typeof ref.firstGid === 'number' ? ref.firstGid : next
      next = Math.max(next, start + count)
    }
    return next
  }

  /** Serialise a sprite set's `SpriteSetData` back to `spritesets/<id>.json`. */
  private _persistSpriteSet(spriteSetId: string): void {
    const resource = this.resource
    const engineSet = resource?.spriteSets.get(spriteSetId)
    if (!resource || !engineSet?.data || !isPlainFilename(spriteSetId)) return
    const projectDir = GLib.path_get_dirname(resource.path)
    const jsonPath = GLib.build_filenamev([projectDir, 'spritesets', `${spriteSetId}.json`])
    if (!this.io.writeText(jsonPath, SpriteSetFormat.serialize(engineSet.data))) {
      this._events.emit('notice', { kind: 'sprite-set-save-failed' })
    }
  }

  /**
   * Serialise the in-memory `GameProjectData` back to disk. Best-
   * effort — failures toast but the in-memory state still updates so
   * the UI doesn't snap back to old values.
   */
  private _persistProject(): void {
    const resource = this.resource
    if (!resource?.data) return
    try {
      const ok = this.io.writeText(resource.path, GameProjectFormat.serialize(resource.data))
      if (!ok) this._events.emit('notice', { kind: 'project-save-failed' })
    } catch (err) {
      console.warn('[ProjectStore] Failed to persist project:', err)
      this._events.emit('notice', { kind: 'project-save-failed' })
    }
  }
}
