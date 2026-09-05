import type { LayerData, LayerPlane } from '@pixelrpg/engine'
import { uniqueIdFrom } from './project-store.ts'

/**
 * The `LayerData` a fresh "New layer" gesture appends: a unique id, a
 * sequential display name, visible by default so the user can paint on
 * it immediately, and — when the caller names one — the plane of the
 * active layer, so "new layer" lands in the section the user is
 * looking at rather than always at the bottom of the world. Appended
 * at the end of the array, it draws on top of its plane siblings,
 * which is what a new layer means in every paint program.
 */
export function nextLayerDraft(layers: readonly LayerData[], plane?: LayerPlane): LayerData {
  const taken = new Set(layers.map((l) => l.id))
  const name = `Layer ${layers.length + 1}`
  return { id: uniqueIdFrom(name, taken, 'layer'), name, visible: true, ...(plane ? { plane } : {}) }
}
