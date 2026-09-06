import type { Properties, SpriteDataMap } from './index'

/**
 * Render plane a {@link LayerData} belongs to — the one depth word the
 * editor shows the user. Maps directly to which Excalibur `TileMap`
 * entity the layer's tile sprites render on:
 *
 * - **ground** — under the player ("Below the hero"). Floors, paths,
 *   water, the static "you walk on this" world.
 * - **hero** — the player's own plane ("At hero height"). Rocks,
 *   shrubs, signs: things the player walks around.
 * - **overlay** — over the player ("Above the hero"). Treetops,
 *   roofs, anything that should obscure the player from above.
 *
 * Optional + defaults to `'ground'` when missing — legacy map files
 * that predate the plane model continue to render as a single
 * ground-plane tilemap, matching the pre-refactor behaviour.
 *
 * Layers that only host functional placements (collision /
 * trigger / camera markers, no visible sprites) typically leave
 * `plane` unset and `visible: false`. The engine doesn't render
 * them on any tilemap; `ObjectSpawnSystem` still spawns their
 * placement entities for runtime systems to consume.
 *
 * The plane is the ONLY cross-layer depth key. Inside one plane the
 * order is the layer's position in `MapData.layers`: a later layer
 * draws over an earlier one, and `WalkOnTileSystem` asks the later
 * one first. There is no per-layer or per-sprite z anywhere else —
 * `LayerData.zIndex`, `SpriteDataMap.zIndex` and the untyped
 * `properties.z` convention all existed once, disagreed silently, and
 * were removed together.
 */
export type LayerPlane = 'ground' | 'hero' | 'overlay'

/** All `LayerPlane` values in render order (low → high z). */
export const LAYER_PLANES: readonly LayerPlane[] = ['ground', 'hero', 'overlay'] as const

/**
 * Fallback plane when `LayerData.plane` is missing — matches the
 * pre-plane-model rendering (everything on the ground-plane tilemap)
 * so legacy project files continue to work.
 */
export const DEFAULT_LAYER_PLANE: LayerPlane = 'ground'

/** Whether `value` names one of the three planes. */
export function isLayerPlane(value: unknown): value is LayerPlane {
  return typeof value === 'string' && (LAYER_PLANES as readonly string[]).includes(value)
}

/**
 * One layer within a tile map. Every layer is a tile layer in the
 * object-system schema; the legacy `type: 'tile' | 'object'` split
 * is gone. Objects live in {@link MapData}.objectPlacements and
 * reference any layer's `id` via `layerId` for sort/visibility
 * grouping.
 *
 * See `docs/concepts/object-system.md`.
 */
export interface LayerData {
  /** Unique identifier for the layer */
  id: string

  /** Display name of the layer */
  name: string

  /** Whether the layer should be rendered */
  visible: boolean

  /**
   * Whether the layer is locked against editing. When true, tile
   * paint / erase commands targeting this layer are rejected by
   * `TileEditorSystem`, and the host's editing tools (pencil /
   * eraser / bucket / rect) grey out when this is the active layer.
   * Pure editor concern — runtime systems ignore the flag.
   *
   * Optional + defaults to false so existing project files without
   * the field continue to work.
   */
  locked?: boolean

  /**
   * Render plane this layer's tile sprites paint to. See
   * {@link LayerPlane}. Optional + defaults to `'ground'`.
   *
   * Layers carrying only placements (no tile sprites at all) may
   * leave this unset — the engine never creates a tilemap for
   * those and the placements render based on their own layer's
   * plane via `ObjectSpawnSystem`.
   */
  plane?: LayerPlane

  /**
   * The storey this layer belongs to: an integer ≥ 0, absent means 0.
   *
   * A forward declaration with no runtime behind it yet — pinned as a
   * type so the later elevation step (a bridge deck at storey 1 over a
   * river bed at storey 0) cannot be foreclosed by today's code. A map's
   * storeys are the distinct `elevation` values its layers carry,
   * derived and never stored: there is no `MapData.floors[]` table.
   * Each storey owns its own ground / hero / overlay triple, and the z
   * of anything on it is `zFor(plane, elevation)`
   * (`components/tilemap-plane.component.ts`). Today the tilemap
   * builder ignores the field and `MapFormat.validate` warns for every
   * layer above storey 0 ("Floor n is not rendered yet"), so a file
   * from a later editor opens and says why it looks flat. Full
   * paragraph: `docs/concepts/object-system.md` § Elevation.
   */
  elevation?: number

  /**
   * Tile sprites placed on this layer. Empty / missing for layers
   * that purely host object placements via `layerId` (e.g. a
   * convention "events" layer).
   */
  sprites?: SpriteDataMap[]

  /** Optional custom properties for the layer */
  properties?: Properties
}
