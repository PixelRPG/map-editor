import {
  type EntityDefinition,
  floorSpriteIdOf,
  getComponentData,
  type MapData,
  type MapReference,
  resolvePlacementDefinition,
  type SpriteSetData,
  type SpriteSetReference,
  terrainIconSpriteId,
} from '@pixelrpg/engine'
import { uniqueIdFrom } from './project-store-sprite-sets.ts'

/**
 * Pure map-CRUD data transforms behind `ProjectStore`'s map create /
 * duplicate / delete — default naming, id allocation, the shape of a
 * blank map, the atlas slot a new card lands on, and the door count a
 * delete confirmation needs. gi-free (no GLib, no file IO) so they
 * unit-test under the node target; the store keeps the IO, broadcast
 * and event ordering.
 */

/** Map-format version a freshly created map is stamped with. */
const MAP_VERSION = '1.0.0'
/** Tile size of a new map, matching `games/blank-starter`. */
const DEFAULT_TILE_SIZE = 16
/** Atlas grid pitch the auto-layout in `project-loader.ts` uses. */
const ATLAS_STEP_X = 360
const ATLAS_STEP_Y = 240
const ATLAS_ORIGIN = 20
/** Columns per atlas row before the layout wraps. */
const ATLAS_COLUMNS = 3

/** Size of a new map in tiles. */
export interface MapSize {
  columns: number
  rows: number
}

/** The three sizes the New map dialog offers, plus the Custom escape hatch. */
export const MAP_SIZE_PRESETS = {
  small: { columns: 20, rows: 14 },
  medium: { columns: 40, rows: 30 },
  large: { columns: 80, rows: 60 },
} as const satisfies Record<string, MapSize>

/** Key of a {@link MAP_SIZE_PRESETS} entry. */
export type MapSizePresetKey = keyof typeof MAP_SIZE_PRESETS

/**
 * Lowest unused `Map N` label for a new map, counting from 1 past the
 * number of maps the project already has. Collisions with a map the
 * user renamed by hand are stepped over, so the suggestion in the
 * dialog is never a duplicate of a visible name.
 *
 * `template` carries the translated msgid with an `%d` placeholder —
 * the store is UI-free (see `src/test.mts`), so the caller supplies it.
 */
export function nextMapName(existingNames: readonly string[], template = 'Map %d'): string {
  const taken = new Set(existingNames.map((n) => n.trim()))
  let n = existingNames.length + 1
  let name = template.replace('%d', String(n))
  while (taken.has(name)) {
    n += 1
    name = template.replace('%d', String(n))
  }
  return name
}

/**
 * `Copy of <name>`, stepping to `Copy of <name> 2` and so on while the
 * label is already taken — the duplicate's default name.
 *
 * `template` carries the translated msgid with a `%s` placeholder.
 */
export function duplicateMapName(
  sourceName: string,
  existingNames: readonly string[],
  template = 'Copy of %s',
): string {
  const taken = new Set(existingNames.map((n) => n.trim()))
  const base = template.replace('%s', sourceName)
  let name = base
  let n = 2
  while (taken.has(name)) name = `${base} ${n++}`
  return name
}

/**
 * The next free atlas slot for a new card: the first position of the
 * `project-loader.ts` auto-layout grid that no existing map sits on (a
 * map is "on" a slot when it is within half a step of it, so a card the
 * user dragged slightly still claims its cell). Keeps a new map from
 * landing exactly under an existing one, where it would be invisible.
 */
export function freeAtlasSlot(occupied: readonly { x: number; y: number }[]): { x: number; y: number } {
  const isTaken = (x: number, y: number) =>
    occupied.some((p) => Math.abs(p.x - x) < ATLAS_STEP_X / 2 && Math.abs(p.y - y) < ATLAS_STEP_Y / 2)
  for (let index = 0; index < occupied.length + ATLAS_COLUMNS; index++) {
    const x = ATLAS_ORIGIN + (index % ATLAS_COLUMNS) * ATLAS_STEP_X
    const y = ATLAS_ORIGIN + Math.floor(index / ATLAS_COLUMNS) * ATLAS_STEP_Y
    if (!isTaken(x, y)) return { x, y }
  }
  // Unreachable for a finite `occupied` (the loop always outruns it by a
  // full row), but a total function beats a non-null assertion.
  return { x: ATLAS_ORIGIN, y: ATLAS_ORIGIN }
}

/** An id for a new map that no existing map reference uses. */
export function uniqueMapId(name: string, takenIds: ReadonlySet<string>): string {
  return uniqueIdFrom(name, takenIds, 'map')
}

/** The tileset a new map starts with, and the tile that floors it (none = empty ground). */
export interface MapGround {
  spriteSet: SpriteSetReference
  floorSpriteId?: number
}

/** How many floor tiles the New-map dialog offers per tileset. */
const FLOOR_CHOICES = 8

/**
 * The tiles the Floor row offers for a tileset: the set's declared
 * ground first, then the picture each terrain brush stands for (grass,
 * sand, water …) — the tiles a child would call "a floor". A sheet that
 * declares neither falls back to its first tiles, so the row is never
 * empty for a set that has any.
 */
export function floorCandidates(data: Pick<SpriteSetData, 'floorSpriteId' | 'sprites' | 'terrains'>): number[] {
  const ids: number[] = []
  const add = (id: number | null | undefined) => {
    if (id == null || ids.includes(id) || !data.sprites.some((sprite) => sprite.id === id)) return
    ids.push(id)
  }
  add(floorSpriteIdOf(data))
  for (const terrain of data.terrains ?? []) add(terrainIconSpriteId(terrain))
  if (ids.length === 0) for (const sprite of data.sprites) add(sprite.id)
  return ids.slice(0, FLOOR_CHOICES)
}

/** One sprite on every cell: the "Floor" row's answer, laid out row by row. */
function floorSprites(columns: number, rows: number, spriteSetId: string, spriteId: number) {
  const sprites: { x: number; y: number; spriteId: number; spriteSetId: string }[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) sprites.push({ x, y, spriteId, spriteSetId })
  return sprites
}

/**
 * The map data a freshly created map starts from: one Background
 * layer, the requested size, and the atlas slot baked into `editorData`
 * so the card appears where the caller decided rather than wherever the
 * auto-layout happens to put the last index.
 *
 * `ground` is the New-map dialog's Tiles + Floor answer: the chosen
 * sprite set becomes the map's only `spriteSets` reference and, when a
 * floor tile is named, it fills the whole layer. Both live in the map
 * JSON, which is what `__project/map.create.chunk` carries — a peer
 * gets the floor and the set reference with the map, no extra op.
 *
 * Modelled on `games/blank-starter/maps/blank-scene.json` — the shape
 * `MapFormat.validate` accepts and the engine can open without a
 * tileset.
 */
export function draftMapData(
  id: string,
  name: string,
  size: MapSize,
  slot: { x: number; y: number },
  layerName = 'Background',
  ground?: MapGround,
): MapData {
  const columns = Math.max(1, Math.floor(size.columns))
  const rows = Math.max(1, Math.floor(size.rows))
  const floor = ground?.floorSpriteId
  return {
    id,
    name,
    version: MAP_VERSION,
    tileWidth: DEFAULT_TILE_SIZE,
    tileHeight: DEFAULT_TILE_SIZE,
    columns,
    rows,
    spriteSets: ground ? [{ ...ground.spriteSet }] : [],
    layers: [
      {
        id: 'layer_0',
        name: layerName,
        visible: true,
        sprites: ground && floor !== undefined ? floorSprites(columns, rows, ground.spriteSet.id, floor) : [],
      },
    ],
    editorData: { atlasX: slot.x, atlasY: slot.y },
  } as MapData
}

/**
 * A detached copy of `source` under a new id + name, placed on `slot`.
 * Deep-copied through JSON so no layer, sprite or placement array stays
 * shared with the original — a duplicate that aliased its source would
 * make every later edit apply to both maps.
 */
export function duplicateMapData(source: MapData, id: string, name: string, slot: { x: number; y: number }): MapData {
  const copy = JSON.parse(JSON.stringify(source)) as MapData
  copy.id = id
  copy.name = name
  copy.editorData = { ...(copy.editorData ?? {}), atlasX: slot.x, atlasY: slot.y }
  return copy
}

/** The `MapReference` that registers a map in `game-project.json`. */
export function mapReferenceFor(id: string, name: string, path: string): MapReference {
  return { id, path, type: 'map', name }
}

/**
 * How many doors (teleport placements) across the whole project lead
 * INTO `mapId`. The delete confirmation names this number, because
 * deleting the map leaves every one of them pointing nowhere.
 * Placements resolve through `resolvePlacementDefinition`, so a door
 * created by the object brush (a `defId` into the entity library)
 * counts exactly like an inline definition.
 */
export function countDoorsInto(
  mapId: string,
  maps: readonly MapData[],
  entityLibrary: readonly EntityDefinition[],
): number {
  let count = 0
  for (const map of maps) {
    for (const placement of map?.objectPlacements ?? []) {
      const def = resolvePlacementDefinition(placement, entityLibrary)
      const teleport = def ? getComponentData(def, 'teleport') : undefined
      if (teleport?.targetMapId === mapId) count += 1
    }
  }
  return count
}
