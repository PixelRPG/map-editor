import type { TilesView } from '../widgets/tiles-view.ts'
import type { CastController } from './cast-controller.ts'
import type { LoadedProject } from './project-loader.ts'
import { countSpriteSetUsers } from './sprite-set-usage.ts'

/**
 * Owns the Tiles view's data + read path.
 *
 * Pushes the project state into the view on (re)hydration and wires
 * the view's mutation callbacks once via `bindCallbacks`. Tile-property
 * MUTATIONS (Solid / Surface) delegate to {@link CastController} — the
 * single owner of sprite-set descriptor writes + collab broadcast — so
 * a local edit persists, broadcasts a `__project/spriteset.update.chunk`
 * to peers, and refreshes live engine collision through the host's
 * `onTilePropertiesChanged` hook, exactly like a rename or an
 * animation edit. This controller only refreshes the inspector
 * afterwards so the switch reflects the new state.
 */
export class TilesController {
  private _project: LoadedProject | null = null

  constructor(
    private readonly view: TilesView,
    private readonly cast: CastController,
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
      this.cast.setTileSolid(spriteSetId, spriteId, solid)
      this.view.refreshInspectorForSelection()
    },
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => {
      this.cast.setTileSurface(spriteSetId, spriteId, surface)
      this.view.refreshInspectorForSelection()
    },
    // How many characters + maps reference this set — drives the delete
    // confirmation's "still used in N place(s)" warning.
    tilesetUsage: (spriteSetId: string): number => {
      const resource = this._project?.resource
      if (!resource) return 0
      return countSpriteSetUsers(resource).get(spriteSetId) ?? 0
    },
  }
}
