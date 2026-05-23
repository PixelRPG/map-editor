import { Actor, Color, Rectangle, type Scene, vec } from 'excalibur'
import { PlacementIdComponent, TIER_Z } from '../components/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

/**
 * Selection highlight overlay — a coloured ring rendered on top of
 * placement actors that appear in `SelectedPlacementsComponent`.
 *
 * One overlay `Actor` per selected placement id. Overlay actors live
 * in the scene's world like any other actor; they re-position
 * themselves every frame from their target's `pos` so future
 * drag-to-move flows work without re-syncing this service.
 *
 * Owner contract: caller (`SelectionHighlightSystem`) holds the
 * overlay pool keyed by placement id, calls
 * {@link refreshSelectionHighlights} on selection changes, and
 * lets {@link syncSelectionHighlightPositions} run every tick so
 * the rings track moving actors.
 */

/**
 * Build a fresh overlay actor for `placement`. Position / size match
 * the target actor, z-pinned one step above the highest tilemap tier
 * so the ring sits above every tile (and above the placement actor
 * itself, which renders at its layer's tier z).
 */
function createHighlightActor(target: Actor): Actor {
  const ring = new Actor({
    name: `selection-highlight:${target.get(PlacementIdComponent)?.id ?? 'unknown'}`,
    pos: target.pos.clone(),
    anchor: target.anchor.clone(),
    width: target.width,
    height: target.height,
  })
  const rect = new Rectangle({
    width: target.width,
    height: target.height,
    color: Color.Transparent,
    strokeColor: Color.fromHex(EDITOR_CONSTANTS.SELECTION_HIGHLIGHT_COLOR),
    lineWidth: EDITOR_CONSTANTS.SELECTION_HIGHLIGHT_LINE_WIDTH,
  })
  ring.graphics.use(rect)
  ring.graphics.anchor = vec(0.5, 0.5)
  ring.z = TIER_Z.overlay + 25
  return ring
}

/**
 * Scan the scene for the placement actor carrying
 * {@link PlacementIdComponent} matching `placementId`. Returns
 * `null` when no actor matches (placement was unspawned, definition
 * was filtered out, etc.). Linear scan over scene entities — fine
 * for the typical few-dozen-placements-per-map case.
 */
function findPlacementActor(scene: Scene, placementId: string): Actor | null {
  for (const entity of scene.world.entityManager.entities) {
    if (!(entity instanceof Actor)) continue
    if (entity.get(PlacementIdComponent)?.id === placementId) return entity
  }
  return null
}

/**
 * Reconcile the overlay pool with `selectedIds`. Adds rings for
 * newly-selected placements, removes rings for no-longer-selected
 * ones. Skips ids whose target actor can't be resolved (typically
 * spurious ids — log silently to avoid noise during scene swaps).
 *
 * The `pool` map is mutated in place. Caller owns the map across
 * calls so the overlay actors persist between selection changes
 * (avoids churn when the same placement re-appears in the next
 * selection set).
 */
export function refreshSelectionHighlights(
  scene: Scene,
  pool: Map<string, { ring: Actor; target: Actor }>,
  selectedIds: readonly string[],
): void {
  const want = new Set(selectedIds)

  for (const [id, entry] of pool) {
    if (!want.has(id)) {
      entry.ring.kill()
      pool.delete(id)
    }
  }

  for (const id of selectedIds) {
    if (pool.has(id)) continue
    const target = findPlacementActor(scene, id)
    if (!target) continue
    const ring = createHighlightActor(target)
    scene.add(ring)
    pool.set(id, { ring, target })
  }
}

/**
 * Per-frame sync: each ring follows its target's `pos`. Cheap (Map
 * iteration over a tiny set), so we do it unconditionally each
 * update instead of subscribing to a movement signal Excalibur
 * doesn't expose.
 *
 * Ring visibility is **independent** of the target's `graphics.visible`
 * — when the user picks an object from the inspector list whose layer
 * is hidden, the placement sprite stays invisible but the ring still
 * draws at the placement's position so the selection has a visual
 * affordance. Deselecting (or selecting another placement) removes
 * the ring via {@link refreshSelectionHighlights}.
 */
export function syncSelectionHighlightPositions(pool: Map<string, { ring: Actor; target: Actor }>): void {
  for (const { ring, target } of pool.values()) {
    ring.pos = target.pos
  }
}
