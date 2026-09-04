import type { LayerData } from '@pixelrpg/engine'
import { uniqueIdFrom } from './project-store.ts'

/**
 * The `LayerData` a fresh "New layer" gesture appends: a unique id, a
 * sequential display name and visible by default, so the user can paint
 * on it immediately.
 */
export function nextLayerDraft(layers: readonly LayerData[]): LayerData {
  const taken = new Set(layers.map((l) => l.id))
  const name = `Layer ${layers.length + 1}`
  return { id: uniqueIdFrom(name, taken, 'layer'), name, visible: true }
}
