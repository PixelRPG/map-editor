import type { SpriteSetReference } from '../reference/index'
import type { LayerData, ObjectPlacement, Properties } from './index'

/**
 * Represents the core data structure for a tile-based map
 * Compatible with Excalibur.js TileMap format
 */
export interface MapData {
  /**
   * Unique identifier for the map
   */
  id: string

  /**
   * Optional name of the tile map
   */
  name?: string

  /**
   * Array of sprite sets that are referenced in the map
   * Only references to external sprite set files are supported
   */
  spriteSets?: SpriteSetReference[]

  /**
   * Optional position of the tile map in world coordinates
   */
  pos?: { x: number; y: number }

  /**
   * Width of an individual tile in pixels
   */
  tileWidth: number

  /**
   * Height of an individual tile in pixels
   */
  tileHeight: number

  /**
   * The number of tile columns (width of the map in tiles)
   */
  columns: number

  /**
   * The number of tile rows (height of the map in tiles)
   */
  rows: number

  /**
   * When true, tiles are rendered from the top of their graphic
   * When false (default), tiles are rendered from the bottom
   */
  renderFromTopOfGraphic?: boolean

  /**
   * Map format version identifier
   */
  version: string

  /**
   * Optional solid fill colour (`#rrggbb`) painted across the map
   * bounds *below* every tile layer. Sparse maps (ported games often
   * store only detail tiles over a flat room colour) rely on this to
   * not render as void — the engine adds a background rect and the
   * editor's previews fill with it. Absent = transparent.
   */
  backgroundColor?: string

  /**
   * Array of layers that make up the map
   * Each layer's tiles will be converted to Excalibur Tiles
   * Multiple layers allow for:
   * - Visual layering (ground, objects, overhead)
   * - Collision layers
   * - Object/trigger layers
   */
  layers: LayerData[]

  /**
   * Object instances on this map — NPCs, teleports, items, spawn
   * points, events. Each placement is tile-snapped and references
   * either a project-level `EntityDefinition` (via `defId`) or
   * carries the full definition inline.
   *
   * See `docs/concepts/object-system.md`. Replaces the legacy
   * `LayerData.objects[]` array in PR 2 of the rollout.
   */
  objectPlacements?: ObjectPlacement[]

  /**
   * Optional custom properties for the map
   */
  properties?: Properties

  /**
   * Optional meshing lookbehind configuration
   * @see TileMapOptions.meshingLookBehind in Excalibur
   */
  meshingLookBehind?: number

  /**
   * Optional editor-specific data
   */
  editorData?: MapEditorData
}

/**
 * Editor-specific (non-runtime) data persisted with a map. Every field
 * is optional — a map without editor data is still a valid map. New
 * keys land here (and ride the `__project/map.editor-data` sync op as
 * a partial patch — see `sync/project-operations.ts`).
 */
export interface MapEditorData {
  /**
   * Grid settings for the editor
   */
  grid?: {
    visible: boolean
    color?: string
    opacity?: number
    size?: number
  }

  /**
   * Camera settings for the editor
   */
  camera?: {
    x: number
    y: number
    zoom: number
  }

  /**
   * Position of the map's card in the editor's atlas (world overview),
   * in atlas-space pixels. Absent until the user first drags the card —
   * the maker then falls back to an auto-layout.
   */
  atlasX?: number

  /** See {@link MapEditorData.atlasX}. */
  atlasY?: number

  /**
   * Viewport of the map's atlas-card preview. Cards render the map at
   * a uniform native-pixel zoom (atlas-global, default 200%) cropped
   * to the card, so only a section is visible — this records which
   * one. Absent = map centre. Adjusted by panning the card's preview
   * content with its lock toggle open.
   */
  preview?: {
    /** Viewport centre, in tile coordinates. */
    tileX?: number
    /** See {@link tileX}. */
    tileY?: number
  }

  /**
   * Custom editor properties
   */
  properties?: Properties
}
