import type { MapEditorData } from '@pixelrpg/engine'

/**
 * Pure `MapEditorData` patch helpers used by the map-persistence path.
 * Kept gi-free (type-only import) so they unit-test under the node target.
 *
 * The point of having these as named functions is the field-preservation
 * contract: a `MapData.editorData` carries atlas position, grid + camera
 * settings and custom properties side by side, so a careless
 * `editorData = { atlasX, atlasY }` write would silently drop the others
 * (the same "fold drops sibling fields" trap that bit the shadow-sync
 * path). These spread the existing record first.
 */

/** Set the atlas-card coordinates, preserving every other editor-data field. */
export function withAtlasPosition(
  editorData: MapEditorData | undefined,
  atlasX: number,
  atlasY: number,
): MapEditorData {
  return { ...editorData, atlasX, atlasY }
}
