/**
 * Constants used throughout the map editor system
 */

export const EDITOR_CONSTANTS = {
  // Zoom settings
  ZOOM_STEP: 0.2,
  MIN_ZOOM: 0.1,
  DEFAULT_ZOOM: 1.0,

  // System priorities
  EDITOR_SYSTEM_PRIORITY: 10,

  // Tile dimensions validation
  MIN_TILE_WIDTH: 1,
  MIN_TILE_HEIGHT: 1,
  MAX_TILE_WIDTH: 1024,
  MAX_TILE_HEIGHT: 1024,

  // Coordinate validation
  MIN_COORDINATE: -999999,
  MAX_COORDINATE: 999999,

  // Fallback colors for tiles
  FALLBACK_COLORS: [
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    '#FFFF00', // Yellow
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#800080', // Purple
    '#FFA500', // Orange
  ] as const,

  // Default layer name when no layer is specified
  DEFAULT_LAYER_NAME: 'default',

  // Sprite validation
  MIN_SPRITE_INDEX: 0,
  MIN_TILE_ID: 0,
  MIN_FIRST_GID: 0,

  // Canvas settings
  DEFAULT_STROKE_WIDTH: 1,
  DEFAULT_FONT_SIZE: 10,
  DEFAULT_FONT_FAMILY: 'Arial',
} as const

/**
 * Get a fallback color based on an index
 * @param index The index to get color for
 * @returns A color string
 */
export function getFallbackColor(index: number): string {
  const safeIndex = Math.abs(index) % EDITOR_CONSTANTS.FALLBACK_COLORS.length
  return EDITOR_CONSTANTS.FALLBACK_COLORS[safeIndex] || EDITOR_CONSTANTS.FALLBACK_COLORS[0]
}

/**
 * Validate tile dimensions
 * @param width Tile width
 * @param height Tile height
 * @returns True if dimensions are valid
 */
export function areTileDimensionsValid(width: number, height: number): boolean {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width >= EDITOR_CONSTANTS.MIN_TILE_WIDTH &&
    height >= EDITOR_CONSTANTS.MIN_TILE_HEIGHT &&
    width <= EDITOR_CONSTANTS.MAX_TILE_WIDTH &&
    height <= EDITOR_CONSTANTS.MAX_TILE_HEIGHT
  )
}

/**
 * Validate coordinates
 * @param x X coordinate
 * @param y Y coordinate
 * @returns True if coordinates are valid
 */
export function areCoordinatesValid(x: number, y: number): boolean {
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    x >= EDITOR_CONSTANTS.MIN_COORDINATE &&
    y >= EDITOR_CONSTANTS.MIN_COORDINATE &&
    x <= EDITOR_CONSTANTS.MAX_COORDINATE &&
    y <= EDITOR_CONSTANTS.MAX_COORDINATE &&
    Number.isFinite(x) &&
    Number.isFinite(y)
  )
}
