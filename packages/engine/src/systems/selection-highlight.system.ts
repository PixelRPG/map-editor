import { type Scene, System, SystemType, type World } from 'excalibur'
import { SelectedPlacementsComponent, SelectionHighlightPoolComponent } from '../components/index.ts'
import { refreshSelectionHighlights, syncSelectionHighlightPositions } from '../services/selection-highlight.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Manages the visual highlight for entries in
 * `SelectedPlacementsComponent`. Each selected placement gets a
 * coloured outline ring overlay; rings track their target's
 * position every tick so future drag-to-move flows update
 * automatically without re-syncing this system.
 *
 * Lifecycle: the overlay pool keyed by stable placement id
 * (`PlacementIdComponent.id`) lives on the session-singleton via
 * {@link SelectionHighlightPoolComponent} so the cross-tick state
 * sits on a scene-attached component, not the system instance
 * (AGENTS.md doctrine). Drops together with the scene when
 * `MapScene` is disposed.
 *
 * Stays decoupled from {@link TileEditorSystem} — selection-vs-paint
 * tooling concerns are independent and the systems mutate disjoint
 * scene state.
 */
export class SelectionHighlightSystem extends System {
  public readonly systemType = SystemType.Update

  private scene?: Scene

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene

    // Seed the pool component on the session-singleton so subsequent
    // reads via SessionState.get return a stable instance.
    if (!SessionState.get(scene, SelectionHighlightPoolComponent)) {
      SessionState.set(scene, new SelectionHighlightPoolComponent())
    }

    // Initial fire primes the (empty) pool; subsequent mutations
    // through `Engine.setSelectedPlacements` re-fire the subscription
    // and reconcile via `refreshSelectionHighlights`.
    SessionState.subscribe(scene, SelectedPlacementsComponent, () => this.refresh())
  }

  public update(_elapsed: number): void {
    const pool = this.scene && SessionState.get(this.scene, SelectionHighlightPoolComponent)
    if (!pool || pool.pool.size === 0) return
    syncSelectionHighlightPositions(pool.pool)
  }

  private refresh(): void {
    if (!this.scene) return
    const poolComponent = SessionState.get(this.scene, SelectionHighlightPoolComponent)
    if (!poolComponent) return
    const selected = SessionState.get(this.scene, SelectedPlacementsComponent)?.placementIds ?? []
    refreshSelectionHighlights(this.scene, poolComponent.pool, selected)
  }
}
