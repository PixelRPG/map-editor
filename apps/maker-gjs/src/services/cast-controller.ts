import {
  type CharacterAnimation,
  type CharacterDefinition,
  characterToEntity,
  type EntityDefinition,
  mergeCharacterIntoEntity,
} from '@pixelrpg/engine'
import {
  GdkSpriteSetResource,
  type NewCharacterDraft,
  type SpriteSetChoice,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import type { CastView } from '../widgets/cast-view.ts'
import {
  appendAnimation,
  applyAnimationEdit,
  isProtectedAnimation,
  removeAnimation,
  replaceAnimation,
  retimeAnimation,
} from './cast-controller-animations.ts'
import { PreviewCache } from './cast-controller-preview-cache.ts'
import { listAssignableSpriteSets, listCharacterViewModels } from './cast-controller-view-model.ts'
import { type ProjectStore, uniqueIdFrom } from './project-store.ts'
import { TypedEmitter } from './typed-emitter.ts'

/** Typed event map for {@link CastController.on}. */
export interface CastControllerEvents {
  /**
   * Emitted on every {@link CastController.refresh} with the project's
   * appearance (character-kind sprite-sheet) list + the shared
   * preview-resource map, so the unified Sheets view's Appearances
   * section + animation editor stay in sync. The cast controller owns
   * appearance data (sheets, animations); the Sheets view just renders
   * it + routes edits back here.
   */
  'appearances-changed': {
    sheets: SpriteSetChoice[]
    spriteSetsById: Map<string, GdkSpriteSetResource | null>
  }
}

/**
 * The **Cast lens** — character view-model conversion + appearance
 * concerns over the {@link ProjectStore}'s `entityLibrary`.
 *
 * The view stays presentational; this controller:
 *   - derives the character list (`character`-template entities +
 *     `playerActorId`) from the store and pushes it into the view on
 *     every (re)hydration,
 *   - exposes a single `callbacks` object wired once into the view
 *     via `castView.bindCallbacks(...)`, so the view can request
 *     mutations without knowing about project state,
 *   - routes EVERY mutation through the store — the single
 *     persist + collab-broadcast pipeline (this controller does no
 *     file IO and holds no project/session reference of its own),
 *   - owns the GTK preview-resource cache + the appearance/animation
 *     editing surface (sheet-owned animations, edited from the Sheets
 *     view via the public methods here).
 *
 * Store changes flow back via typed store events: another lens's (or a
 * peer's) entity edit re-hydrates this view automatically.
 */
export class CastController {
  /**
   * Preview resources keyed by sprite-set id, so the cast gallery can
   * preview every character on its own sheet without re-wrapping a set
   * per refresh. Invalidated wholesale on project swap, per-id on set
   * changes.
   */
  private readonly _previews = new PreviewCache<GdkSpriteSetResource>((id) => this._loadSpriteSetPreview(id))
  private readonly _events = new TypedEmitter<CastControllerEvents>()

  constructor(
    private readonly view: CastView,
    private readonly store: ProjectStore,
  ) {
    view.bindCallbacks(this.callbacks)
    // Raw-entity edits from the cast detail's "all components" disclosure.
    view.connect('character-entity-changed', (_v: CastView, json: string) => {
      try {
        this.upsertCharacterEntity(JSON.parse(json) as EntityDefinition)
      } catch {
        /* malformed payload — ignore */
      }
    })
    // A different project (or a re-open) invalidates every wrapped
    // sprite-set — drop the cache so stale textures can't leak across.
    store.on('project-changed', () => {
      this._previews.clear()
      void this.refresh()
    })
    // Sprite-sets are shared project assets (a character's sheet) —
    // evict the affected preview + re-hydrate on any set change,
    // whether it came from this lens, the Sheets view, or a peer.
    store.on('sprite-sets-changed', ({ spriteSetId }) => {
      if (spriteSetId) this._previews.evict(spriteSetId)
      else this._previews.clear()
      void this.refresh()
    })
    // Another lens (Objects) or a peer edited the shared entityLibrary —
    // re-hydrate. Our own edits skip this (the mutation paths below
    // already refresh exactly where the old behaviour did).
    store.on('entity-library-changed', ({ source }) => {
      if (source !== 'cast') void this.refresh()
    })
  }

  /** Subscribe to a controller event. Returns an unsubscribe closure. */
  on<K extends keyof CastControllerEvents>(event: K, listener: (payload: CastControllerEvents[K]) => void): () => void {
    return this._events.on(event, listener)
  }

  /**
   * Persist + broadcast a raw entity definition edited through the cast
   * detail's "all components" disclosure (the advanced surface bypasses
   * the view model — it edits `components[]` directly). Refreshes so the
   * friendly fields reflect any appearance / speed change made there.
   */
  upsertCharacterEntity(entity: EntityDefinition): void {
    this.store.upsertEntity(entity, 'cast')
    void this.refresh()
  }

  /** The full entity definition for a character id (for the disclosure editor). */
  entityForCharacter(id: string): EntityDefinition | null {
    return this.store.findEntity(id)
  }

  /**
   * Push the project's character list + sprite-sheet list + a shared
   * per-sprite-set preview map into the Cast view. Triggered by store
   * events (project swap, entity/sprite-set changes) and after every
   * local mutation that changes a character, a sheet, or the set list.
   *
   * Resolves a GTK preview resource for every sprite-set id referenced by
   * the cast OR exposed as a character sheet (cached by id) so each card
   * previews its OWN sheet and the detail previews follow the active
   * character / sheet. Sheets are pushed BEFORE characters so the
   * character detail's sheet picker has the fresh list when it refreshes.
   */
  async refresh(): Promise<void> {
    const resource = this.store.resource
    if (!resource) {
      this.view.setSheets([])
      this.view.setCharacters([], new Map())
      this._events.emit('appearances-changed', { sheets: [], spriteSetsById: new Map() })
      return
    }

    const characters = listCharacterViewModels(this.store.data)
    const sheets = this._listSpriteSets()
    // Resolve every sprite-set a character references OR that the
    // Sprite-sheets section lists, into one shared map.
    const neededIds = new Set<string>([...characters.map((c) => c.spriteSetId), ...sheets.map((s) => s.id)])
    const spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
    for (const id of neededIds) {
      spriteSetsById.set(id, await this._previews.get(id))
    }
    // Cast gets the appearance choices for its picker; the Sheets view
    // gets the full list + shared preview map (it owns the gallery +
    // animation editor now, sharing the memoised cache).
    this.view.setSheets(sheets)
    this.view.setCharacters(characters, spriteSetsById)
    this._events.emit('appearances-changed', { sheets, spriteSetsById })
  }

  /** Wire once into `CastView.bindCallbacks`. */
  readonly callbacks = {
    rename: (id: string, name: string) => {
      this._mutate(id, (c) => {
        c.name = name
      })
    },
    setPlayer: (id: string, isPlayer: boolean) => this._setPlayer(id, isPlayer),
    // The "all components" disclosure needs the character's raw entity +
    // the project ref-picker options.
    getCharacterEntity: (id: string) => this.entityForCharacter(id),
    getRefOptions: () => this.store.refOptions(),
    // The project's EFFECTIVE registry — a component whose game system is
    // off is not offered in the disclosure's Add menu.
    getComponentRegistry: () => this.store.componentRegistry(),
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
    deleteCharacter: (id: string) => this._deleteCharacter(id),
    listSpriteSets: () => this._listSpriteSets(),
    createCharacter: (draft: NewCharacterDraft) => this._createCharacter(draft),
    importSpriteSet: (result: SpriteSetImportResult) => this.store.importSpriteSet(result),
    loadSpriteSetPreview: (id: string) => this._loadSpriteSetPreview(id),
    // Sheet-owned animation authoring now lives in the Cast detail's
    // Action×Direction matrix (moved from the Sheets view). These delegate
    // to the same public mutators, so persistence + collab are unchanged.
    addAnimation: (sheetId: string, animation: CharacterAnimation) => this.addAnimation(sheetId, animation),
    editAnimation: (sheetId: string, originalId: string, animation: CharacterAnimation) =>
      this.editAnimation(sheetId, originalId, animation),
    deleteAnimation: (sheetId: string, animId: string) => this.deleteAnimation(sheetId, animId),
  }

  /**
   * Set a uniform per-frame duration across one animation on a sheet
   * ("apply to all frames"). Public so both the Cast detail (via
   * `callbacks`) and the animation editor drive the same sheet-owned
   * mutation; per-frame durations are set frame-by-frame in the editor.
   */
  setAnimationDuration(sheetId: string, animId: string, durationMs: number): void {
    this._mutateSheetAnimations(sheetId, (anims) => retimeAnimation(anims, animId, durationMs))
  }

  /** Append a new animation to a sheet (dialog-validated; defensive re-check here). */
  addAnimation(sheetId: string, animation: CharacterAnimation): void {
    this._mutateSheetAnimations(sheetId, (anims) => appendAnimation(anims, animation))
  }

  /** Replace `originalId`'s animation on a sheet (treats a lost original as an add). */
  editAnimation(sheetId: string, originalId: string, animation: CharacterAnimation): void {
    this._mutateSheetAnimations(sheetId, (anims) => replaceAnimation(anims, originalId, animation))
  }

  /** Remove a custom animation from a sheet (required roles are protected). */
  deleteAnimation(sheetId: string, animId: string): void {
    if (isProtectedAnimation(animId)) return
    this._mutateSheetAnimations(sheetId, (anims) => removeAnimation(anims, animId))
  }

  /** Every sprite sheet assignable to a character, in picker order. */
  private _listSpriteSets(): SpriteSetChoice[] {
    const resource = this.store.resource
    if (!resource) return []
    return listAssignableSpriteSets(resource.spriteSets, resource.data?.entityLibrary)
  }

  /**
   * Write a character view model back as its `entityLibrary` entry
   * (`characterToEntity`) through the store (persist + broadcast).
   * Single write path for create / rename / speed / sheet-change. Does
   * NOT touch the player flag — that rides `playerActorId` via
   * {@link _setPlayer}.
   */
  private _upsertCharacter(char: CharacterDefinition): void {
    // Merge onto the existing entity so the basic fields (name / sheet /
    // speed) don't drop components the user added via the "all components"
    // disclosure; a brand-new character has no entity yet → build fresh.
    const existing = this.store.findEntity(char.id)
    const entity = existing ? mergeCharacterIntoEntity(existing, char) : characterToEntity(char)
    this.store.upsertEntity(entity, 'cast')
  }

  /**
   * Assemble a full {@link CharacterDefinition} from the dialog draft:
   * generate a unique id, reference the chosen sheet (animations live
   * on the sheet, seeded on import), and enforce the single-player
   * invariant. Persist + refresh, then focus the new character so the
   * user lands on it.
   */
  private _createCharacter(draft: NewCharacterDraft): void {
    const data = this.store.data
    if (!data) return
    const takenIds = new Set((data.entityLibrary ?? []).map((e) => e.id))
    const id = uniqueIdFrom(draft.name, takenIds)
    const character: CharacterDefinition = {
      id,
      name: draft.name,
      kind: draft.kind,
      spriteSetId: draft.spriteSetId,
      defaultAnimation: 'idle-down',
      speedTilesPerSec: draft.speedTilesPerSec,
    }
    this._upsertCharacter(character)
    if (draft.isPlayer) this.store.setPlayerActor(id, 'cast')
    void this.refresh().then(() => this.view.focusCharacter(id))
  }

  /**
   * Remove a character from the project via the store: it drops the
   * `entityLibrary` entry, persists, and broadcasts a
   * `__project/entity.remove` so peers drop it too (`applyEntityRemove`
   * also clears `playerActorId` if this was the player). The view
   * re-selects the first remaining character on refresh.
   */
  private _deleteCharacter(id: string): void {
    if (!this.store.removeEntity(id, 'cast')) return
    void this.refresh()
  }

  /** Wrap a project sprite set as a GTK preview resource. */
  private async _loadSpriteSetPreview(id: string): Promise<GdkSpriteSetResource | null> {
    const engineSet = await this.store.resource?.getSpriteSet(id)
    if (!engineSet) return null
    try {
      return await GdkSpriteSetResource.fromEngineResource(engineSet)
    } catch (err) {
      console.warn('[CastController] Failed to wrap sprite set for preview:', err)
      return null
    }
  }

  /**
   * Set / clear the project player. The one-of-N invariant is structural
   * — `playerActorId` is a single id, so no per-character flag to clear.
   * Refresh moves the "Player" badge. Persists + broadcasts `player.set`
   * via the store.
   */
  private _setPlayer(id: string, isPlayer: boolean): void {
    this.store.setPlayerActor(isPlayer ? id : null, 'cast')
    void this.refresh()
  }

  /**
   * Mutate a character via the given closure: load its view model, apply
   * the change, and write it back as an `entityLibrary` entry (persist +
   * broadcast). Returns silently when the character isn't found.
   */
  private _mutate(id: string, mutator: (c: CharacterDefinition) => void): void {
    const character = listCharacterViewModels(this.store.data).find((c) => c.id === id)
    if (!character) return
    mutator(character)
    this._upsertCharacter(character)
  }

  /**
   * Apply a sheet-owned animation edit (see `cast-controller-animations`)
   * through the store's descriptor pipeline — persist + chunked
   * descriptor broadcast — then evict the preview + refresh. Keyed by
   * `spriteSetId`: animations belong to the sheet, not to a character.
   *
   * `edit` returning `null` is a REJECTION (duplicate id, protected
   * role, unknown animation). Rejecting the store mutation is what stops
   * the persist AND the full-sheet broadcast: a local no-op that still
   * broadcast would overwrite a peer's concurrent edit of the same sheet
   * with our stale copy.
   */
  private _mutateSheetAnimations(
    spriteSetId: string,
    edit: (anims: readonly CharacterAnimation[]) => CharacterAnimation[] | null,
  ): void {
    const mutated = this.store.mutateSpriteSetData(spriteSetId, (draft) => applyAnimationEdit(draft, edit))
    if (!mutated) return
    this._previews.evict(spriteSetId)
    void this.refresh()
  }
}
