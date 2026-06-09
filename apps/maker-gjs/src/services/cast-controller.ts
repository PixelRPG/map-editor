import GLib from '@girs/glib-2.0'
import {
  applyCharacterRemove,
  applyCharacterUpsert,
  applySpriteSetReference,
  applySpriteSetRemove,
  CHARACTER_REMOVE_KIND,
  CHARACTER_UPSERT_KIND,
  type CharacterAnimation,
  type CharacterDefinition,
  createCharacterRemoveOp,
  createCharacterUpsertOp,
  createSpriteSetRemoveOp,
  GameProjectFormat,
  type ProjectOp,
  REQUIRED_ROLES,
  SPRITESET_REMOVE_KIND,
  type SpriteSetAddPayload,
  SpriteSetFormat,
  SpriteSetResource,
} from '@pixelrpg/engine'
import {
  GdkSpriteSetResource,
  type NewCharacterDraft,
  type SpriteSetChoice,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import type { CastView } from '../widgets/cast-view.ts'
import type { CollabSession } from './collab-session.ts'
import { copyFile, deleteFile, readBinaryFile, writeBinaryFile, writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'
import { characterSpriteSetIds, isCharacterSpriteSet } from './sprite-set-classification.ts'

/** Default per-frame duration (ms) seeded into a new character's animations. */
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
 * Owns the Cast view's data + mutation path.
 *
 * The view stays presentational; this controller:
 *   - holds the active project ref + pushes its character list and
 *     the player's sprite-set into the view on every (re)hydration,
 *   - exposes a single `callbacks` object wired once into the view
 *     via `castView.bindCallbacks(...)`, so the view can request
 *     mutations without knowing about file IO or project state,
 *   - persists the in-memory `GameProjectData` back to
 *     `game-project.json` after every mutation.
 *
 * Pattern mirrors the existing `EngineController` — a thin service
 * per editor mode, owned by `ApplicationWindow`, with file IO + view
 * coordination kept out of the host widget.
 */
export class CastController {
  private _project: LoadedProject | null = null
  /**
   * Active collab session, when one is live. Set by the host window on
   * session start/stop. While set, every local cast mutation also
   * broadcasts a `__project/character.upsert` so peers stay in sync;
   * inbound ops arrive via {@link applyRemoteProjectOp}. Null in solo
   * editing (the common case) — then mutations only persist locally.
   */
  private _session: CollabSession | null = null
  /**
   * Cache of GTK preview resources keyed by sprite-set id, so the cast
   * gallery can preview every character on its own sheet without
   * re-wrapping a set per refresh. Rebuilt lazily in {@link refresh};
   * invalidated wholesale on project swap.
   */
  private _spriteSetCache = new Map<string, GdkSpriteSetResource | null>()
  /**
   * Invoked after the project's sprite-set list changes (import /
   * delete / inbound peer add+remove) so the host can re-hydrate the
   * Tiles view — sprite-sets are shared project assets shown in both
   * places. Null until the host wires it.
   */
  onSpriteSetsChanged: (() => void) | null = null

  constructor(
    private readonly view: CastView,
    private readonly onToast: (message: string) => void,
  ) {
    view.bindCallbacks(this.callbacks)
  }

  /**
   * Attach/detach the live collab session. While attached, cast
   * mutations broadcast to peers; detaching (null) returns to
   * local-only editing.
   */
  setCollabSession(session: CollabSession | null): void {
    this._session = session
  }

  /**
   * Apply an inbound project op from a peer: mutate the in-memory
   * `GameProjectData`, persist, and refresh the Cast view. Does NOT
   * re-broadcast (no loopback). A character referencing a sprite-set
   * this peer lacks (e.g. one imported mid-session — binary import
   * sync is a follow-up) still lands; its preview just falls back to
   * empty until the set arrives.
   */
  applyRemoteProjectOp(op: ProjectOp): void {
    const data = this._project?.resource?.data
    if (!data) return
    if (op.kind === CHARACTER_UPSERT_KIND) {
      applyCharacterUpsert(data, op.payload.character)
    } else if (op.kind === CHARACTER_REMOVE_KIND) {
      applyCharacterRemove(data, op.payload.characterId)
    } else if (op.kind === SPRITESET_REMOVE_KIND) {
      this._applyRemoteSpriteSetRemove(op.payload.spriteSetId)
      return
    } else {
      return
    }
    this._persist()
    void this.refresh()
  }

  /**
   * Apply an inbound sprite-set removal from a peer: drop the reference,
   * delete the local `<id>.png` + `<id>.json`, evict the live resource +
   * preview cache, persist, and refresh BOTH views. Idempotent. Does
   * NOT re-broadcast.
   */
  private _applyRemoteSpriteSetRemove(id: string): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    if (!resource.data.spriteSets?.some((s) => s.id === id)) return
    this._removeSpriteSetFiles(id)
    applySpriteSetRemove(resource.data, id)
    resource.spriteSets.delete(id)
    this._spriteSetCache.delete(id)
    this._persist()
    void this.refresh()
    this.onSpriteSetsChanged?.()
  }

  /** Broadcast the current state of one character to peers (no-op solo). */
  private _broadcastCharacter(id: string): void {
    const session = this._session
    if (!session) return
    const character = this._project?.resource?.data?.characters?.find((c) => c.id === id)
    if (!character) return
    session.sendProjectOp(({ peerId, seq }) => createCharacterUpsertOp({ peerId, seq, character }))
  }

  /**
   * Swap the active project. Pass `null` to clear (e.g. when the user
   * closes the project). Triggers an asynchronous hydration of the
   * Cast view from the new project's data.
   */
  setProject(project: LoadedProject | null): void {
    this._project = project
    // A different project (or a re-open) invalidates every wrapped
    // sprite-set — drop the cache so stale textures can't leak across.
    this._spriteSetCache.clear()
    void this.refresh()
  }

  /**
   * Push the project's character list + sprite-sheet list + a shared
   * per-sprite-set preview map into the Cast view. Called by `setProject`
   * and after every mutation that changes a character, a sheet, or the
   * sprite-set list.
   *
   * Resolves a GTK preview resource for every sprite-set id referenced by
   * the cast OR exposed as a character sheet (cached by id) so each card
   * previews its OWN sheet and the detail previews follow the active
   * character / sheet. Sheets are pushed BEFORE characters so the
   * character detail's sheet picker has the fresh list when it refreshes.
   */
  async refresh(): Promise<void> {
    const resource = this._project?.resource
    if (!resource) {
      this.view.setSheets([], new Map())
      this.view.setCharacters([], new Map())
      return
    }
    this.view.projectName = resource.data?.name ?? _('New Project')

    const characters = resource.data?.characters ?? []
    const sheets = this._listSpriteSets()
    // Resolve every sprite-set a character references OR that the
    // Sprite-sheets section lists, into one shared map.
    const neededIds = new Set<string>([...characters.map((c) => c.spriteSetId), ...sheets.map((s) => s.id)])
    const spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
    for (const id of neededIds) {
      spriteSetsById.set(id, await this._resolveSpriteSet(id))
    }
    this.view.setSheets(sheets, spriteSetsById)
    this.view.setCharacters(characters, spriteSetsById)
  }

  /**
   * Wrap a project sprite-set as a GTK preview resource, memoised by
   * id. A failed/absent set caches `null` so a broken reference doesn't
   * retry-storm on every refresh.
   */
  private async _resolveSpriteSet(id: string): Promise<GdkSpriteSetResource | null> {
    if (this._spriteSetCache.has(id)) return this._spriteSetCache.get(id) ?? null
    let wrapped: GdkSpriteSetResource | null = null
    const engineSpriteSet = await this._project?.resource?.getSpriteSet(id)
    if (engineSpriteSet) {
      try {
        wrapped = await GdkSpriteSetResource.fromEngineResource(engineSpriteSet)
      } catch (err) {
        console.warn('[CastController] Failed to wrap sprite set for preview:', err)
      }
    }
    this._spriteSetCache.set(id, wrapped)
    return wrapped
  }

  /** Wire once into `CastView.bindCallbacks`. */
  readonly callbacks = {
    rename: (id: string, name: string) => {
      this._mutate(id, (c) => {
        c.name = name
      })
    },
    setPlayer: (id: string, isPlayer: boolean) => this._setPlayer(id, isPlayer),
    setSpeed: (id: string, tilesPerSec: number) => {
      this._mutate(id, (c) => {
        c.speedTilesPerSec = tilesPerSec
      })
    },
    // Reassign a character to a different sprite sheet (it inherits the
    // sheet's look + animations).
    changeSheet: (id: string, sheetId: string) => {
      this._mutate(id, (c) => {
        c.spriteSetId = sheetId
      })
      void this.refresh()
    },
    // Animations live on the SHEET now (shared by every character using
    // it), so these mutate the sprite-sheet directly, keyed by sheet id.
    setDuration: (sheetId: string, animId: string, durationMs: number) => {
      this._mutateSheetAnimations(sheetId, (anims) => {
        const anim = anims.find((a) => a.id === animId)
        if (anim) anim.durationMs = durationMs
      })
    },
    addAnimation: (sheetId: string, animation: CharacterAnimation) => {
      this._mutateSheetAnimations(sheetId, (anims) => {
        // Dialog-side validation already rejected duplicate ids + empty
        // frames; defensive double-check so a mismatch can't corrupt it.
        if (animation.frames.length === 0) return
        if (anims.some((a) => a.id === animation.id)) return
        anims.push(animation)
      })
    },
    editAnimation: (sheetId: string, originalId: string, animation: CharacterAnimation) => {
      this._mutateSheetAnimations(sheetId, (anims) => {
        if (animation.frames.length === 0) return
        const idx = anims.findIndex((a) => a.id === originalId)
        if (idx === -1) {
          // The original is gone (edited in another session, …) — treat
          // as an add so the user's frames aren't lost.
          if (!anims.some((a) => a.id === animation.id)) anims.push(animation)
          return
        }
        // A rename must not collide with an existing entry.
        if (animation.id !== originalId) {
          const collision = anims.findIndex((a) => a.id === animation.id)
          if (collision !== -1 && collision !== idx) return
        }
        anims[idx] = animation
      })
    },
    deleteAnimation: (sheetId: string, animId: string) => {
      // Required roles can't be removed (part of the character contract).
      if ((REQUIRED_ROLES as readonly string[]).includes(animId)) return
      this._mutateSheetAnimations(sheetId, (anims) => {
        const idx = anims.findIndex((a) => a.id === animId)
        if (idx !== -1) anims.splice(idx, 1)
      })
    },
    deleteCharacter: (id: string) => this._deleteCharacter(id),
    deleteSheet: (id: string) => this.deleteSpriteSet(id),
    listSpriteSets: () => this._listSpriteSets(),
    createCharacter: (draft: NewCharacterDraft) => this._createCharacter(draft),
    importSpriteSet: (result: SpriteSetImportResult) => this._importSpriteSet(result),
    loadSpriteSetPreview: (id: string) => this._loadSpriteSetPreview(id),
  }

  /**
   * Every sprite set available to assign to a character: the project's
   * own sets plus engine built-ins (e.g. the scientist). Sourced from
   * the loaded resource map so a just-imported set shows up too.
   *
   * Sets already used by a character sort first, so the New Character
   * dialog defaults to an actual character sheet (whose first sprite
   * previews well) rather than, say, an environment tileset whose
   * sprite 0 is a transparent tile.
   */
  private _listSpriteSets(): SpriteSetChoice[] {
    const resource = this._project?.resource
    if (!resource) return []
    // Only sprite SHEETS are assignable to a character — world tilesets
    // are excluded (see `isCharacterSpriteSet`).
    const usedByCharacter = characterSpriteSetIds(resource.data?.characters)
    return [...resource.spriteSets.entries()]
      .filter(([id, set]) => isCharacterSpriteSet(set.data?.kind, usedByCharacter.has(id)))
      .map(([id, set]) => ({ id, name: set.data?.name ?? id }))
      .sort((a, b) => Number(usedByCharacter.has(b.id)) - Number(usedByCharacter.has(a.id)))
  }

  /**
   * Assemble a full {@link CharacterDefinition} from the dialog draft:
   * generate a unique id, seed the eight required directional
   * animations (single frame each — the user refines them in the
   * animation editor), and enforce the single-player invariant. Persist
   * + refresh, then focus the new character so the user lands on it.
   */
  private _createCharacter(draft: NewCharacterDraft): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    const characters = (resource.data.characters ??= [])
    const id = this._uniqueId(draft.name, new Set(characters.map((c) => c.id)))
    // No animations here — the character inherits them from its chosen
    // sheet (seeded on sheet import; see `_seedCharacterAnimations`).
    const character: CharacterDefinition = {
      id,
      name: draft.name,
      kind: draft.kind,
      spriteSetId: draft.spriteSetId,
      defaultAnimation: 'idle-down',
      speedTilesPerSec: draft.speedTilesPerSec,
    }
    if (draft.isPlayer) {
      for (const c of characters) c.isPlayer = false
      character.isPlayer = true
    }
    characters.push(character)
    this._persist()
    this._broadcastCharacter(id)
    void this.refresh().then(() => this.view.focusCharacter(id))
  }

  /**
   * Remove a character from the project: drop it from `characters[]`,
   * persist, broadcast a `__project/character.remove` so peers drop it
   * too, and refresh. The view re-selects the first remaining character
   * (its `setCharacters` clears a stale active id).
   */
  private _deleteCharacter(id: string): void {
    const data = this._project?.resource?.data
    if (!data?.characters?.some((c) => c.id === id)) return
    applyCharacterRemove(data, id)
    this._persist()
    const session = this._session
    if (session) session.sendProjectOp(({ peerId, seq }) => createCharacterRemoveOp({ peerId, seq, characterId: id }))
    void this.refresh()
  }

  /**
   * Import a sprite set into the project: finalise a unique id + a
   * non-overlapping `firstGid`, copy the source image into
   * `spritesets/<id>.png`, write `spritesets/<id>.json`, register the
   * reference in `game-project.json`, and load it into the live
   * resource map so it's usable without reopening the project. Returns
   * the new set as a {@link SpriteSetChoice} for the character dialog to
   * select, or `null` if the copy/write failed.
   */
  private async _importSpriteSet({ data, sourcePath }: SpriteSetImportResult): Promise<SpriteSetChoice | null> {
    const resource = this._project?.resource
    if (!resource?.data) return null
    const id = this._uniqueId(data.id, new Set(resource.spriteSets.keys()))
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

    if (!copyFile(sourcePath, pngDest)) {
      this.onToast(_('Could not copy the image into the project'))
      return null
    }
    if (!writeTextFile(jsonDest, SpriteSetFormat.serialize(finalData))) {
      this.onToast(_('Could not save the sprite set'))
      return null
    }

    resource.data.spriteSets.push({
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset',
      firstGid: this._nextFirstGid(),
    })
    this._persist()

    // Register into the live resource map so the character dialog's
    // preview + the cast view resolve it immediately (no reopen).
    try {
      const engineSet = new SpriteSetResource(jsonDest, { headless: false })
      await engineSet.load()
      resource.spriteSets.set(id, engineSet)
    } catch (err) {
      console.warn('[CastController] Imported set written but failed to load live:', err)
    }
    // Sync to peers (chunked — carries the image bytes). Best-effort:
    // a read failure just means peers won't get this set live.
    if (this._session) {
      const bytes = readBinaryFile(pngDest)
      if (bytes) this._session.sendSpriteSetAdd({ data: finalData, imageBase64: GLib.base64_encode(bytes) })
    }
    this._spriteSetCache.delete(id)
    this.onSpriteSetsChanged?.()
    this.onToast(_(`Imported sprite set “${finalData.name}”`))
    return { id, name: finalData.name }
  }

  /**
   * Public entry for importing a sprite set — used by both the Cast
   * view (sprite-set for a character) and the Tiles view (a new
   * tileset). Both surfaces present the same {@link SpriteSetImportDialog}
   * and route its result here so the copy + register + collab-broadcast
   * path lives in one place.
   */
  importSpriteSet(result: SpriteSetImportResult): Promise<SpriteSetChoice | null> {
    return this._importSpriteSet(result)
  }

  /**
   * Delete a sprite set (tileset) from the project: drop its reference,
   * delete the `<id>.png` + `<id>.json` files, evict the live resource +
   * preview cache, persist, broadcast a `__project/spriteset.remove`,
   * and refresh both views. No-op for an unknown id. Built-in sets
   * (`built-in:*`, which have no project files) are guarded by the
   * caller — the Tiles view never offers a delete affordance for them.
   */
  deleteSpriteSet(id: string): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    if (!resource.data.spriteSets?.some((s) => s.id === id)) return
    this._removeSpriteSetFiles(id)
    applySpriteSetRemove(resource.data, id)
    resource.spriteSets.delete(id)
    this._spriteSetCache.delete(id)
    this._persist()
    const session = this._session
    if (session) session.sendProjectOp(({ peerId, seq }) => createSpriteSetRemoveOp({ peerId, seq, spriteSetId: id }))
    void this.refresh()
    this.onSpriteSetsChanged?.()
  }

  /**
   * Delete the on-disk `<id>.png` + `<id>.json` of a project sprite set.
   * Best-effort — a failed delete logs but doesn't abort the in-memory
   * removal (the reference is gone either way; an orphaned file is
   * harmless).
   */
  private _removeSpriteSetFiles(id: string): void {
    const resource = this._project?.resource
    if (!resource) return
    if (!isPlainFilename(id)) return
    const projectDir = GLib.path_get_dirname(resource.path)
    deleteFile(GLib.build_filenamev([projectDir, 'spritesets', `${id}.png`]))
    deleteFile(GLib.build_filenamev([projectDir, 'spritesets', `${id}.json`]))
  }

  /**
   * Apply an inbound sprite-set import from a peer: write the image +
   * descriptor into this project's `spritesets/`, register the
   * reference (keeping the sender's id so characters that reference it
   * still resolve), load it live, persist, and refresh. Idempotent —
   * re-applying overwrites the same files + replaces the ref by id.
   */
  applyRemoteSpriteSetAdd(payload: SpriteSetAddPayload): void {
    const resource = this._project?.resource
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
      console.warn('[CastController] Rejected peer sprite-set with unsafe id:', id)
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

    if (!writeBinaryFile(pngDest, GLib.base64_decode(payload.imageBase64))) {
      console.warn('[CastController] Failed to write peer sprite-set image:', pngDest)
      return
    }
    writeTextFile(jsonDest, SpriteSetFormat.serialize(safeData))
    applySpriteSetReference(resource.data, {
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset',
      // Recompute on our side — gid space is per-peer; the sender's
      // value may collide with ours.
      firstGid: this._nextFirstGid(),
    })
    this._persist()
    void (async () => {
      try {
        const engineSet = new SpriteSetResource(jsonDest, { headless: false })
        await engineSet.load()
        resource.spriteSets.set(id, engineSet)
      } catch (err) {
        console.warn('[CastController] Peer sprite-set written but failed to load live:', err)
      }
      this._spriteSetCache.delete(id)
      void this.refresh()
      this.onSpriteSetsChanged?.()
    })()
  }

  /** Wrap a project sprite set as a GTK preview resource for the dialogs. */
  private async _loadSpriteSetPreview(id: string): Promise<GdkSpriteSetResource | null> {
    const engineSet = await this._project?.resource?.getSpriteSet(id)
    if (!engineSet) return null
    try {
      return await GdkSpriteSetResource.fromEngineResource(engineSet)
    } catch (err) {
      console.warn('[CastController] Failed to wrap sprite set for preview:', err)
      return null
    }
  }

  /** Lowest unused id derived from `name` (`hero`, `hero-2`, `hero-3`, …). */
  private _uniqueId(name: string, taken: Set<string>): string {
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item'
    let id = base
    let n = 2
    while (taken.has(id)) id = `${base}-${n++}`
    return id
  }

  /**
   * Next non-overlapping `firstGid` for a new sprite set: one past the
   * highest global tile id any existing set occupies. Keeps the
   * imported set usable as a tileset later without gid collisions.
   */
  private _nextFirstGid(): number {
    const resource = this._project?.resource
    if (!resource?.data) return 1
    let next = 1
    for (const ref of resource.data.spriteSets) {
      const count = resource.spriteSets.get(ref.id)?.data?.sprites?.length ?? 0
      const start = typeof ref.firstGid === 'number' ? ref.firstGid : next
      next = Math.max(next, start + count)
    }
    return next
  }

  /**
   * Toggle the `isPlayer` flag with one-of enforcement: exactly one
   * character is the player at any time. Refresh the view afterwards
   * so the "Player" badge moves to the new owner.
   */
  private _setPlayer(id: string, isPlayer: boolean): void {
    const characters = this._project?.resource?.data?.characters
    if (!characters) return
    if (isPlayer) {
      for (const c of characters) c.isPlayer = c.id === id
    } else {
      const target = characters.find((c) => c.id === id)
      if (target) target.isPlayer = false
    }
    this._persist()
    // Upsert of an `isPlayer: true` character clears the others on the
    // receiver too, so one broadcast carries the whole player switch.
    this._broadcastCharacter(id)
    void this.refresh()
  }

  /**
   * Mutate a character in-place via the given closure. Returns
   * silently when the character isn't found so callers don't need to
   * null-check. Auto-persists after the mutation lands.
   */
  private _mutate(id: string, mutator: (c: CharacterDefinition) => void): void {
    const character = this._project?.resource?.data?.characters?.find((c) => c.id === id)
    if (!character) return
    mutator(character)
    this._persist()
    this._broadcastCharacter(id)
  }

  /**
   * Mutate a sprite SHEET's animations (sheet-owned now, shared by every
   * character using it) + persist the sheet's JSON + refresh. Keyed by
   * `spriteSetId` — the Sprite-sheets section edits a sheet directly.
   */
  private _mutateSheetAnimations(spriteSetId: string, mutator: (anims: CharacterAnimation[]) => void): void {
    const resource = this._project?.resource
    const engineSet = resource?.spriteSets.get(spriteSetId)
    if (!resource || !engineSet?.data) return
    const anims = (engineSet.data.characterAnimations ??= [])
    mutator(anims)
    this._persistSheet(spriteSetId)
    this._spriteSetCache.delete(spriteSetId)
    void this.refresh()
  }

  /** Serialise a sprite sheet's `SpriteSetData` back to `spritesets/<id>.json`. */
  private _persistSheet(spriteSetId: string): void {
    const resource = this._project?.resource
    const engineSet = resource?.spriteSets.get(spriteSetId)
    if (!resource || !engineSet?.data || !isPlainFilename(spriteSetId)) return
    const projectDir = GLib.path_get_dirname(resource.path)
    const jsonPath = GLib.build_filenamev([projectDir, 'spritesets', `${spriteSetId}.json`])
    if (!writeTextFile(jsonPath, SpriteSetFormat.serialize(engineSet.data))) {
      this.onToast(_('Could not save the sprite sheet'))
    }
  }

  /**
   * Serialise the in-memory `GameProjectData` back to disk. Best-
   * effort — failures toast but the in-memory state still updates so
   * the UI doesn't snap back to old values.
   */
  private _persist(): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    try {
      const ok = writeTextFile(resource.path, GameProjectFormat.serialize(resource.data))
      if (!ok) this.onToast(_('Could not save project'))
    } catch (err) {
      console.warn('[CastController] Failed to persist project:', err)
      this.onToast(_('Could not save project'))
    }
  }
}
