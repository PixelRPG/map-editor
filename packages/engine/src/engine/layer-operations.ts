import { AddLayerCommand, type Command, SetLayerLockedCommand, SetLayerVisibilityCommand } from '../commands/index.ts'
import type { LayerData } from '../types/data/index.ts'
import type { ActiveSceneAccessor } from './scene-binding.ts'

/**
 * The layer list of the active map.
 *
 * `visible` and `locked` are persisted `MapData` state, not view state,
 * so every toggle rides a {@link Command} through the op-log (undo
 * stack + `COMMAND_EXECUTED` → peers) rather than a direct field write.
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
    const previousVisible = layer.visible !== false
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
}
