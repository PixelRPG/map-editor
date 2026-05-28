/**
 * Constants used throughout the map editor system.
 *
 * Only entries with a live consumer in `packages/` or `apps/` live
 * here. Each entry's call site is documented inline to surface stale
 * entries as the codebase evolves — if a site disappears, prune the
 * constant rather than leaving it as orphaned configuration.
 */
export const EDITOR_CONSTANTS = {
  // `CameraControlSystem.handleZoomEvent`: per-wheel-notch zoom delta
  // and the absolute floor the camera clamps to (avoid an inverted /
  // imperceptibly-small viewport).
  ZOOM_STEP: 0.2,
  MIN_ZOOM: 0.1,

  // `TileEditorSystem.resolveLayerId`: fallback id when the active
  // layer is unset and the map has no `layers[0]` to fall back on.
  // Newly-created maps from the blank template still ship at least
  // one layer, so this is the cold-start safety net only.
  DEFAULT_LAYER_NAME: 'default',

  // `pencil-preview.applyHoverPreview`: opacity of the brush ghost
  // rendered at the hovered tile. Low enough that the underlying tile
  // stays clearly visible, high enough that the ghost still reads as
  // *the* preview rather than noise.
  PAINT_PREVIEW_OPACITY: 0.5,

  // `selection-highlight.attachSelectionRing`: bright-orange ring on
  // top of the selected placement actor. Colour picked for contrast
  // against the typical green / brown RPG palette and the kind-marker
  // outlines (cyan / yellow / green / purple / teal / salmon).
  SELECTION_HIGHLIGHT_COLOR: '#ff8800',
  SELECTION_HIGHLIGHT_LINE_WIDTH: 2,
} as const
