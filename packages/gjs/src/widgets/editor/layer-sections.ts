// Pure rules behind the Layers tab's three sections: which rows a
// section shows, in what order, and what array position a drop means.
// GTK-free so the list ↔ array mapping is unit-tested; the tab only
// translates pointer positions into these calls.

import { DEFAULT_LAYER_PLANE, type LayerPlane } from '@pixelrpg/engine'

/** The sections top to bottom on screen — the world's order, roof first. */
export const SECTION_PLANES: readonly LayerPlane[] = ['overlay', 'hero', 'ground'] as const

/** The minimum a layer needs to be sorted into a section. */
export interface SectionLayer {
  id: string
  plane?: LayerPlane
}

/** The plane a layer renders on — the engine's absent-means-ground rule. */
export function planeOf(layer: Pick<SectionLayer, 'plane'>): LayerPlane {
  return layer.plane ?? DEFAULT_LAYER_PLANE
}

/**
 * The rows of one section, top to bottom: the layers of `plane` by
 * DESCENDING array index, so the top row is the layer that draws on
 * top of its siblings — the same reading order as the map and every
 * paint program, and the inverse of a raw array dump.
 */
export function layersInSection<T extends SectionLayer>(layers: readonly T[], plane: LayerPlane): T[] {
  return layers.filter((layer) => planeOf(layer) === plane).reverse()
}

/** Where a dragged row was released, relative to an existing row. */
export interface DropAnchor {
  layerId: string
  /** `above` = the dragged layer should draw ON TOP of the anchor; `below` = under it. */
  position: 'above' | 'below'
}

/** A drop, translated into the engine's vocabulary: the target plane and array position. */
export interface LayerDrop {
  plane: LayerPlane
  /** Position in `MapData.layers` AFTER the dragged layer is taken out, i.e. the splice index. */
  index: number
}

/**
 * Translate a drop in section `plane` into the array position the
 * engine's reorder / set-plane commands take.
 *
 * With an anchor row, "above" means the dragged layer lands right after
 * the anchor in the array (later = drawn on top) and "below" right
 * before it. Without an anchor — released on the section's empty space
 * — the layer goes to the bottom of a populated section (under every
 * sibling) or, for an empty section, to the end of the array, where the
 * plane alone decides its depth. `null` when the dragged layer or the
 * anchor is not in the list.
 */
export function resolveLayerDrop(
  layers: readonly SectionLayer[],
  draggedId: string,
  plane: LayerPlane,
  anchor: DropAnchor | null,
): LayerDrop | null {
  const remaining = layers.filter((layer) => layer.id !== draggedId)
  if (remaining.length === layers.length) return null
  if (anchor) {
    const anchorIndex = remaining.findIndex((layer) => layer.id === anchor.layerId)
    if (anchorIndex < 0) return null
    return { plane, index: anchor.position === 'above' ? anchorIndex + 1 : anchorIndex }
  }
  const sectionIndices = remaining.flatMap((layer, index) => (planeOf(layer) === plane ? [index] : []))
  return { plane, index: sectionIndices.length > 0 ? Math.min(...sectionIndices) : remaining.length }
}
