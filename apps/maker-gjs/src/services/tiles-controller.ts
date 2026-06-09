import { type SpriteSetData, SpriteSetFormat } from '@pixelrpg/engine'
import type { Engine } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import type { TilesView } from '../widgets/tiles-view.ts'
import { writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'
import { countSpriteSetUsers } from './sprite-set-usage.ts'

/**
 * Owns the Tiles view's data + mutation path.
 *
 * Mirrors `CastController` — pushes the project state into the view
 * on (re)hydration, exposes mutation callbacks wired once via
 * `bindCallbacks`, persists the affected sprite-set's JSON after
 * every change, and pushes the live `tile.solid` refresh into the
 * engine when one is running.
 *
 * Engine ref is optional + lazy: this controller is constructed
 * before the user opens any scene (the engine is per-scene), so we
 * accept a getter and call it on demand. When the getter returns
 * `null` (no active scene) the live-refresh step skips — the next
 * scene-editor entry rebuilds the map from disk and picks up the
 * persisted JSON automatically.
 */
export class TilesController {
  private _project: LoadedProject | null = null

  constructor(
    private readonly view: TilesView,
    private readonly getEngine: () => Engine | null,
    private readonly onToast: (message: string) => void,
  ) {
    view.bindCallbacks(this.callbacks)
  }

  /** Swap the active project. Triggers asynchronous view hydration. */
  setProject(project: LoadedProject | null): void {
    this._project = project
    void this.view.setProject(project?.resource ?? null)
  }

  /** Wire once into `TilesView.bindCallbacks`. */
  readonly callbacks = {
    setSolid: (spriteSetId: string, spriteId: number, solid: boolean) => {
      this._mutateSprite(spriteSetId, spriteId, (def) => {
        def.solid = solid
      })
    },
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => {
      this._mutateSprite(spriteSetId, spriteId, (def) => {
        if (surface) {
          def.tileProperties = { ...(def.tileProperties ?? {}), surface }
        } else if (def.tileProperties?.surface !== undefined) {
          const next = { ...def.tileProperties }
          delete next.surface
          def.tileProperties = Object.keys(next).length === 0 ? undefined : next
        }
      })
    },
    // How many characters + maps reference this set — drives the delete
    // confirmation's "still used in N place(s)" warning.
    tilesetUsage: (spriteSetId: string): number => {
      const resource = this._project?.resource
      if (!resource) return 0
      return countSpriteSetUsers(resource).get(spriteSetId) ?? 0
    },
  }

  /**
   * Apply a closure to a single sprite definition in the active
   * sprite-set, then refresh the engine's tile.solid map (if a
   * scene is running) + persist the sprite-set JSON to disk + nudge
   * the view to re-read so the inspector reflects the new state.
   *
   * Centralising the post-mutation work here means every property
   * editor (Solid, Surface, future ones) gets the full refresh
   * pipeline for free.
   */
  private _mutateSprite(
    spriteSetId: string,
    spriteId: number,
    mutator: (def: SpriteSetData['sprites'][number]) => void,
  ): void {
    const spriteSet = this._project?.resource?.spriteSets.get(spriteSetId)
    const def = spriteSet?.data?.sprites.find((s) => s.id === spriteId)
    if (!spriteSet || !def) return
    mutator(def)
    // Conditional engine refresh — only fires when a MapScene is
    // active. From the Tiles view the engine is disposed; the next
    // scene-editor entry reloads from disk and picks the change up.
    this.getEngine()?.refreshTileSolidsForSprite(spriteSetId, spriteId)
    this._persistSpriteSet(spriteSet)
    this.view.refreshInspectorForSelection()
  }

  private _persistSpriteSet(spriteSet: { path: string; data: SpriteSetData }): void {
    try {
      const ok = writeTextFile(spriteSet.path, SpriteSetFormat.serialize(spriteSet.data))
      if (!ok) this.onToast(_('Could not save tile properties'))
    } catch (err) {
      console.warn('[TilesController] Failed to serialize sprite-set:', err)
      this.onToast(_('Could not save tile properties'))
    }
  }
}
