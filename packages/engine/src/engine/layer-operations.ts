import {
  AddLayerCommand,
  type Command,
  ReorderLayerCommand,
  SetLayerLockedCommand,
  SetLayerPlaneCommand,
  SetLayerVisibilityCommand,
} from '../commands/index.ts'
import { isLayerDataVisible } from '../services/layer-visibility.ts'
import type { LayerData, LayerPlane } from '../types/data/index.ts'
import { DEFAULT_LAYER_PLANE } from '../types/data/LayerData.ts'
import type { ActiveSceneAccessor } from './scene-binding.ts'

/**
 * The layer list of the active map.
 *
 * `visible`, `locked`, `plane` and the position in the list are
 * persisted `MapData` state, not view state, so every change rides a
 * {@link Command} through the op-log (undo stack + `COMMAND_EXECUTED` →
 * peers) rather than a direct field write.
 * The deliberate consequence is that hiding a layer is undoable, and
 * that a padlock one peer sets is respected by the other peer's edit
 * paths.
 *
 * Every method resolves its layer through {@link find}, so the three
 * mutators and the lock read agree on what "the active map" means.
 */
export class LayerOperations {
  constructor(
    private readonly activeScene: ActiveSceneAccessor,
    private readonly execute: (command: Command, origin?: string) => void,
  ) {}

  /** Resolve a `LayerData` by id on the active map, or `null`. */
  find(layerId: string): LayerData | null {
    const scene = this.activeScene()
    if (!scene) return null
    return scene.mapResource?.mapData?.layers.find((layer) => layer.id === layerId) ?? null
  }

  /**
   * Read a layer's `locked` flag. `false` for a missing layer / scene —
   * "treat as editable" is the safer default for an unknown id, since
   * the paint path then no-ops through its own checks anyway.
   */
  isLocked(layerId: string): boolean {
    return this.find(layerId)?.locked ?? false
  }

  /**
   * Toggle `visible`. The command's `apply` owns both the `MapData`
   * write and the graphics refresh, so a peer applying the same op
   * refreshes its canvas identically. `true` on success — including a
   * same-value toggle, which dispatches nothing.
   */
  setVisible(layerId: string, visible: boolean): boolean {
    const layer = this.find(layerId)
    if (!layer) return false
    const previousVisible = isLayerDataVisible(layer)
    if (previousVisible === visible) return true
    this.execute(new SetLayerVisibilityCommand({ layerId, visible, previousVisible }))
    return true
  }

  /**
   * Toggle `locked`. No graphics rebuild — consumers check the flag at
   * the start of their edit paths and short-circuit.
   */
  setLocked(layerId: string, locked: boolean): boolean {
    const layer = this.find(layerId)
    if (!layer) return false
    const previousLocked = layer.locked ?? false
    if (previousLocked === locked) return true
    this.execute(new SetLayerLockedCommand({ layerId, locked, previousLocked }))
    return true
  }

  /**
   * Append a fully built layer (caller supplies a unique id + name).
   * `false` without an active map or when the id already exists.
   */
  add(layer: LayerData, origin?: string): boolean {
    const scene = this.activeScene()
    if (!scene) return false
    const layers = scene.mapResource?.mapData?.layers
    if (!layers) return false
    if (layers.some((existing) => existing.id === layer.id)) return false
    this.execute(new AddLayerCommand({ layer }), origin)
    return true
  }

  /**
   * Move a layer to `index` in `MapData.layers` — the order inside its
   * plane, since the plane picks the tilemap and the array position
   * picks what draws on top within it. `index` is clamped to the list.
   * `false` without an active map or for an unknown id; `true` for a
   * no-op move, which dispatches nothing.
   */
  reorder(layerId: string, index: number, origin?: string): boolean {
    const layers = this.layers()
    if (!layers) return false
    const previousIndex = layers.findIndex((layer) => layer.id === layerId)
    if (previousIndex < 0) return false
    const target = clampIndex(index, layers.length)
    if (target === previousIndex) return true
    this.execute(new ReorderLayerCommand({ layerId, index: target, previousIndex }), origin)
    return true
  }

  /**
   * Move a layer to another plane, optionally to a position inside the
   * list at the same time (a drag between the Layers tab's sections
   * lands at a row, not just in a bucket). One command, one undo step.
   * `false` without an active map or for an unknown id; `true` when
   * nothing changes, which dispatches nothing.
   */
  setPlane(layerId: string, plane: LayerPlane, index?: number, origin?: string): boolean {
    const layers = this.layers()
    if (!layers) return false
    const previousIndex = layers.findIndex((layer) => layer.id === layerId)
    if (previousIndex < 0) return false
    const previousPlane = layers[previousIndex].plane
    const target = clampIndex(index ?? previousIndex, layers.length)
    if ((previousPlane ?? DEFAULT_LAYER_PLANE) === plane && target === previousIndex) return true
    this.execute(new SetLayerPlaneCommand({ layerId, plane, previousPlane, index: target, previousIndex }), origin)
    return true
  }

  /** The active map's mutable layer list, or `null` off a realised scene. */
  private layers(): LayerData[] | null {
    const scene = this.activeScene()
    if (!scene) return null
    return scene.mapResource?.mapData?.layers ?? null
  }
}

/** Clamp a requested list position into `[0, length - 1]`. */
function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Math.trunc(index), length - 1))
}
