import { type Actor, type Scene, System, SystemType, type World } from 'excalibur'
import { SelectedPlacementsComponent } from '../components/index.ts'
import { refreshSelectionHighlights, syncSelectionHighlightPositions } from '../services/selection-highlight.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Manages the visual highlight for entries in
 * `SelectedPlacementsComponent`. Each selected placement gets a
 * coloured outline ring overlay; rings track their target's
 * position every tick so future drag-to-move flows update
 * automatically without re-syncing this system.
 *
 * Lifecycle: pool keyed by stable placement id (`PlacementIdComponent.id`)
 * persists across selection mutations so the same actor's ring is
 * reused if the user deselects + reselects it within one session.
 * The pool is dropped together with the scene when `MapScene` is
 * disposed (entries are scene-local).
 *
 * Stays decoupled from {@link TileEditorSystem} — selection-vs-paint
 * tooling concerns are independent and the systems mutate disjoint
 * scene state.
 */
export class SelectionHighlightSystem extends System {
  public readonly systemType = SystemType.Update

  private scene?: Scene
  private readonly pool = new Map<string, { ring: Actor; target: Actor }>()

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene

    // Initial fire primes the (empty) pool; subsequent mutations
    // through `Engine.setSelectedPlacements` re-fire the subscription
    // and reconcile via `refreshSelectionHighlights`.
    SessionState.subscribe(scene, SelectedPlacementsComponent, () => this.refresh())
  }

  public update(_elapsed: number): void {
    if (this.pool.size === 0) return
    syncSelectionHighlightPositions(this.pool)
  }

  private refresh(): void {
    if (!this.scene) return
    const selected = SessionState.get(this.scene, SelectedPlacementsComponent)?.placementIds ?? []
    refreshSelectionHighlights(this.scene, this.pool, selected)
  }
}
