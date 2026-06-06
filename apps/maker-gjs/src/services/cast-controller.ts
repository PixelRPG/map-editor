import GLib from '@girs/glib-2.0'
import {
  type CharacterAnimation,
  type CharacterDefinition,
  GameProjectFormat,
  REQUIRED_ROLES,
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
import { copyFile, writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'

/** Default per-frame duration (ms) seeded into a new character's animations. */
const DEFAULT_ANIMATION_MS = 200
/** Default frame index seeded into every required animation role. */
const DEFAULT_FRAME = 0

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

  constructor(
    private readonly view: CastView,
    private readonly onToast: (message: string) => void,
  ) {
    view.bindCallbacks(this.callbacks)
  }

  /**
   * Swap the active project. Pass `null` to clear (e.g. when the user
   * closes the project). Triggers an asynchronous hydration of the
   * Cast view from the new project's data.
   */
  setProject(project: LoadedProject | null): void {
    this._project = project
    void this.refresh()
  }

  /**
   * Push the project's character list + player sprite-set into the
   * Cast view. Called by `setProject` and after every mutation that
   * changes the player character or its sprite-set binding.
   */
  async refresh(): Promise<void> {
    const resource = this._project?.resource
    if (!resource) {
      this.view.setCharacters([], null)
      return
    }
    this.view.projectName = resource.data?.name ?? _('New Project')

    const characters = resource.data?.characters ?? []
    const player = characters.find((c) => c.isPlayer)
    let spriteSet: GdkSpriteSetResource | null = null
    if (player) {
      const engineSpriteSet = await resource.getSpriteSet(player.spriteSetId)
      if (engineSpriteSet) {
        try {
          spriteSet = await GdkSpriteSetResource.fromEngineResource(engineSpriteSet)
        } catch (err) {
          console.warn('[CastController] Failed to wrap sprite set for preview:', err)
        }
      }
    }
    this.view.setCharacters(characters, spriteSet)
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
    setDuration: (id: string, animId: string, durationMs: number) => {
      this._mutate(id, (c) => {
        const anim = c.animations.find((a) => a.id === animId)
        if (anim) anim.durationMs = durationMs
      })
      void this.refresh()
    },
    addAnimation: (id: string, animation: CharacterAnimation) => {
      this._mutate(id, (c) => {
        // Dialog-side validation already rejected duplicate ids +
        // empty frames; this is a defensive double-check so a
        // dialog/controller mismatch can't corrupt the project.
        if (animation.frames.length === 0) return
        if (c.animations.some((a) => a.id === animation.id)) return
        c.animations.push(animation)
      })
      void this.refresh()
    },
    editAnimation: (id: string, originalId: string, animation: CharacterAnimation) => {
      this._mutate(id, (c) => {
        if (animation.frames.length === 0) return
        const idx = c.animations.findIndex((a) => a.id === originalId)
        if (idx === -1) {
          // The original isn't there anymore (deleted in another
          // session, race with file reload, …). Treat the edit as
          // an add — the user's frames don't get lost.
          if (!c.animations.some((a) => a.id === animation.id)) {
            c.animations.push(animation)
          }
          return
        }
        // Renaming a custom animation has to clear any existing
        // entry that already holds the new name (collisions are
        // dialog-side rejected, but a stale list could still slip
        // one through). Replace in place when the id is unchanged.
        if (animation.id !== originalId) {
          const collision = c.animations.findIndex((a) => a.id === animation.id)
          if (collision !== -1 && collision !== idx) return
        }
        c.animations[idx] = animation
      })
      void this.refresh()
    },
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
    const usedByCharacter = new Set((resource.data?.characters ?? []).map((c) => c.spriteSetId))
    return [...resource.spriteSets.entries()]
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
    const id = this._uniqueId(
      draft.name,
      new Set(characters.map((c) => c.id)),
    )
    const character: CharacterDefinition = {
      id,
      name: draft.name,
      kind: draft.kind,
      spriteSetId: draft.spriteSetId,
      animations: REQUIRED_ROLES.map((role) => ({ id: role, frames: [DEFAULT_FRAME], durationMs: DEFAULT_ANIMATION_MS })),
      defaultAnimation: 'idle-down',
      speedTilesPerSec: draft.speedTilesPerSec,
    }
    if (draft.isPlayer) {
      for (const c of characters) c.isPlayer = false
      character.isPlayer = true
    }
    characters.push(character)
    this._persist()
    void this.refresh().then(() => this.view.focusCharacter(id))
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
    const finalData = { ...data, id, image: { ...(data.image ?? { id: 'main', type: 'image' as const }), path: imageFile } }

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
    this.onToast(_(`Imported sprite set “${finalData.name}”`))
    return { id, name: finalData.name }
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
