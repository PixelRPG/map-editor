import type { Scene } from 'excalibur'
import { MapScene } from '../scenes/map.scene.ts'
import type { LayerData } from '../types/data/index.ts'
import type { Command } from './types.ts'

/**
 * Payload of {@link AddLayerCommand}. The caller builds the full
 * {@link LayerData} (stable id + name); `index` is the insertion point
 * in `MapData.layers` (appended when omitted / out of range).
 */
export interface AddLayerPayload {
  layer: LayerData
  index?: number
}

/**
 * Add a layer to the active map's `MapData.layers`. Layers are PERSISTED
 * document state (saved into the shared map JSON), so per AGENTS.md
 * [Transport-ready primitives] rule 2 the mutation rides a registered
 * Command — a peer applying the op gets the same layer, and undo removes
 * it. `revert` removes the layer by id; by the undo-stack invariant any
 * paints onto the new layer are reverted before the add, so the layer is
 * empty when this runs (no sprite/graphics cleanup needed).
 *
 * Idempotent on `apply`: a layer whose id already exists is skipped
 * (mirrors the flag commands' tolerant `resolveLayer`), so a replayed
 * op / double-dispatch can't duplicate it.
 */
export class AddLayerCommand implements Command<AddLayerPayload> {
  static readonly KIND = 'layer.add'
  readonly kind = AddLayerCommand.KIND

  constructor(readonly payload: AddLayerPayload) {}

  get label(): string {
    return `Add layer "${this.payload.layer.name}"`
  }

  apply(scene: Scene): void {
    const layers = layersOf(scene)
    if (!layers) return
    if (layers.some((l) => l.id === this.payload.layer.id)) return
    const { index } = this.payload
    if (index === undefined || index < 0 || index > layers.length) {
      layers.push(this.payload.layer)
    } else {
      layers.splice(index, 0, this.payload.layer)
    }
  }

  revert(scene: Scene): void {
    const layers = layersOf(scene)
    if (!layers) return
    const i = layers.findIndex((l) => l.id === this.payload.layer.id)
    if (i >= 0) layers.splice(i, 1)
  }
}

/**
 * Payload of {@link RenameLayerCommand}. `previousName` is captured by
 * the caller at dispatch time so `revert` needs no lookup and a remote
 * peer converges to the same name even if it renamed concurrently.
 */
export interface RenameLayerPayload {
  layerId: string
  name: string
  previousName: string
}

/**
 * Rename a layer. The name is persisted document state (it ends up in
 * the shared map JSON and in every peer's Layers page), so per
 * AGENTS.md [Transport-ready primitives] rule 2 it rides a registered
 * Command rather than a direct field write — the inline entry on the
 * row commits through the op-log, which makes the rename undoable and
 * visible to peers.
 */
export class RenameLayerCommand implements Command<RenameLayerPayload> {
  static readonly KIND = 'layer.rename'
  readonly kind = RenameLayerCommand.KIND

  constructor(readonly payload: RenameLayerPayload) {}

  get label(): string {
    return `Rename layer to "${this.payload.name}"`
  }

  apply(scene: Scene): void {
    this.write(scene, this.payload.name)
  }

  revert(scene: Scene): void {
    this.write(scene, this.payload.previousName)
  }

  private write(scene: Scene, name: string): void {
    const layer = layersOf(scene)?.find((l) => l.id === this.payload.layerId)
    if (!layer) {
      console.warn(`[RenameLayer] no layer resolves for id "${this.payload.layerId}" — command skipped`)
      return
    }
    layer.name = name
  }
}

/** Resolve the active map's mutable `layers` array, or `null` off a realised `MapScene`. */
function layersOf(scene: Scene): LayerData[] | null {
  if (!(scene instanceof MapScene)) return null
  return scene.mapResource?.mapData?.layers ?? null
}
