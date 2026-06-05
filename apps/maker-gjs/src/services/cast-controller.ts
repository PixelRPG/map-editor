import { type CharacterAnimation, type CharacterDefinition, GameProjectFormat } from '@pixelrpg/engine'
import { GdkSpriteSetResource } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import type { CastView } from '../widgets/cast-view.ts'
import { writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'

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
