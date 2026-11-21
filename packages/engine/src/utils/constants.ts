/**
 * Constants used throughout the map editor system.
 *
 * Only entries with a live consumer in `packages/` or `apps/` live
 * here. Each entry's call site is documented inline to surface stale
 * entries as the codebase evolves — if a site disappears, prune the
 * constant rather than leaving it as orphaned configuration.
 */
export const EDITOR_CONSTANTS = {
  // Fallback tile dimension (px) when `MapData.tileWidth/tileHeight`
  // (or the Data view's `properties.defaultTileSize`) are absent —
  // schema semantics shared by spawn positioning, player movement and
  // the engine's tilemap construction. ONE definition: a scatter of
  // `?? 16` literals previously risked drifting per site (subtle
  // spawn/movement misalignment on maps without explicit sizes).
  DEFAULT_TILE_SIZE: 16,

  // `CameraControlSystem.handleZoomEvent`: per-wheel-notch zoom delta
  // and the absolute floor the camera clamps to (avoid an inverted /
  // imperceptibly-small viewport).
  ZOOM_STEP: 0.2,
  MIN_ZOOM: 0.1,
  // Pinch-zoom's ceiling. The wheel has none because a notch moves zoom
  // by a fixed 0.2 and a user stops when the view looks right; a pinch
  // multiplies, so two fingers crossing the screen can ask for 20x in one
  // gesture and strand the user in a viewport showing four tiles.
  MAX_ZOOM: 8,

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

  // `select-hover-border` palette — drawn at the hovered tile while
  // the `'select'` tool is active. Two colours so the user can tell
  // at a glance whether clicking would select an object placement or
  // hit an empty tile cell. Both are Adwaita accent shades for
  // consistency with the rest of the editor chrome:
  // - tile border = Adwaita blue (accent)
  // - object border = Adwaita yellow (warning) — distinct from the
  //   final selection orange so hover and "committed" selection
  //   read differently.
  HOVER_TILE_BORDER_COLOR: '#3584e4',
  HOVER_OBJECT_BORDER_COLOR: '#f5c211',
  HOVER_BORDER_LINE_WIDTH: 2,

  // `fill-preview` palette — the region a bucket-fill click would
  // repaint, outlined and tinted while the `'fill'` tool hovers. Adwaita
  // green (success): a fill ADDS, and green is taken by no other overlay
  // (select = blue, object = yellow, selection = orange). The tint is
  // faint so the tiles underneath stay legible; the outline carries the
  // "where does it stop" answer.
  FILL_PREVIEW_COLOR: '#2ec27e',
  FILL_PREVIEW_TINT_ALPHA: 0.22,

  // `eraser-preview` palette — the cell an eraser click would clear on
  // the active layer. Adwaita red (destructive) when the cell holds
  // sprites the click removes; a neutral grey outline when it holds
  // nothing on that layer, so the tool still shows where it is without
  // promising a change the click cannot make.
  ERASE_PREVIEW_COLOR: '#e01b24',
  ERASE_PREVIEW_TINT_ALPHA: 0.35,
  ERASE_PREVIEW_EMPTY_COLOR: '#77767b',
} as const
