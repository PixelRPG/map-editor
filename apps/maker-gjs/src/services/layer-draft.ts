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

/**
 * Where a tap on a plane chip lands: the remembered layer if it still
 * exists, else the plane's topmost layer, else `create` - a new game
 * starts with the ground only, and every height must stay reachable.
 */
export function planeTarget(
  layers: ReadonlyArray<{ id: string; plane?: LayerPlane }>,
  plane: LayerPlane,
  remembered?: string,
): { kind: 'existing'; id: string } | { kind: 'create' } {
  if (remembered && layers.some((l) => l.id === remembered)) return { kind: 'existing', id: remembered }
  const top = [...layers].reverse().find((l) => (l.plane ?? 'ground') === plane)
  return top ? { kind: 'existing', id: top.id } : { kind: 'create' }
}
