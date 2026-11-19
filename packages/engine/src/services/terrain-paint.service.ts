import type { CellSprites, PaintCellsPayload } from '../commands/paint-tile.command.ts'
import { PaintCellsCommand, sameCellSprites } from '../commands/paint-tile.command.ts'
import type { MapEditorComponent, TileSpriteRef } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import {
  TERRAIN_MASK_FULL,
  resolveTerrainTile,
  terrainFootprintCells,
  terrainIndexOf,
  terrainMaskAt,
} from '../resource/terrain.ts'
import type { TerrainAddress, TerrainBounds } from '../resource/terrain.ts'
import type { SpriteSetData, TerrainData } from '../types/data/index.ts'
import { getSpritesAt } from './map-editor-shadow.service.ts'

/**
 * The terrain planner — the ONE place that decides which sprite every
 * cell holds after a terrain-aware edit.
 *
 * It takes the shadow state, a layer and a list of intents ("put
 * terrain T here", "take the top thing off there", "put this exact tile
 * there"), applies them to a scratch copy, re-resolves every terrain
 * member in the touched cells AND the ring around them, and returns
 * only the cells whose sprite list actually changed — each with its
 * `previousSprites`, ready to become one {@link PaintCellsCommand}.
 *
 * Three consequences worth naming, all of them design (`TERRAIN.md`
 * §6.2, §7.1, §7.3):
 *
 * - **One planner, not per-tool logic.** Pencil, eraser, fill and the
 *   plain tile pencil differ only in the intents they hand in. "Any
 *   edit that adds or removes a terrain member re-resolves the ring
 *   around it" is implemented once, here.
 * - **Same layer only.** Neighbours are read from `layerId` and nowhere
 *   else, so the same terrain on two layers is two independent shapes
 *   and no other layer's lock is ever involved.
 * - **Resolved tiles travel, not intents.** The plan is data; a peer
 *   applies it without running the resolver, so a tileset edit one peer
 *   has not received yet cannot make the two disagree.
 */

/** One edit handed to the planner. Coordinates are tile coordinates on the planned layer. */
export type TerrainPaintIntent =
  /** Put `terrainId` of `spriteSetId` here — the whole footprint (2×2 for a patch terrain). */
  | { readonly kind: 'terrain'; readonly x: number; readonly y: number; readonly terrain: TerrainAddress }
  /** Take the top thing off this cell — the eraser's whole rule (§6.2). */
  | { readonly kind: 'clear'; readonly x: number; readonly y: number }
  /** Put exactly this sprite here, replacing the cell — the plain pencil, the stamp. */
  | { readonly kind: 'tile'; readonly x: number; readonly y: number; readonly sprite: TileSpriteSlot }

export type { TerrainAddress }

/** A sprite as it sits in a cell — the shadow ref without its layer. */
export type TileSpriteSlot = Omit<TileSpriteRef, 'layerId'>

/**
 * Terrain lookup for the sprite sets a map uses.
 *
 * Built once per edit rather than per neighbour: the alternative is a
 * linear scan of every terrain's table for every one of the (at most
 * 16) touched cells times eight neighbours.
 */
export interface TerrainCatalog {
  /** The terrain a sprite in a cell belongs to, or `undefined`. */
  terrainOfSprite(spriteSetId: string, spriteId: number): TerrainData | undefined
  /** The terrain a brush addresses, or `undefined`. */
  terrainAt(address: TerrainAddress): TerrainData | undefined
  /** Whether any sprite set in the catalogue defines a terrain at all. */
  readonly hasTerrains: boolean
}

/** Build a catalogue from `(spriteSetId → data)` pairs. Pure — the unit tests use it directly. */
export function terrainCatalogOf(sets: Iterable<readonly [string, Pick<SpriteSetData, 'terrains'>]>): TerrainCatalog {
  const bySet = new Map<string, Map<number, TerrainData>>()
  const byId = new Map<string, Map<string, TerrainData>>()
  let hasTerrains = false
  for (const [spriteSetId, data] of sets) {
    bySet.set(spriteSetId, terrainIndexOf(data))
    const ids = new Map<string, TerrainData>()
    for (const terrain of data.terrains ?? []) {
      if (!ids.has(terrain.id)) ids.set(terrain.id, terrain)
      hasTerrains = true
    }
    byId.set(spriteSetId, ids)
  }
  return {
    hasTerrains,
    terrainOfSprite: (spriteSetId, spriteId) => bySet.get(spriteSetId)?.get(spriteId),
    terrainAt: ({ spriteSetId, terrainId }) => byId.get(spriteSetId)?.get(terrainId),
  }
}

/** The catalogue for every sprite set a loaded map holds. */
export function terrainCatalogForMap(mapResource: MapResource | null | undefined): TerrainCatalog {
  if (!mapResource) return terrainCatalogOf([])
  const entries: Array<readonly [string, Pick<SpriteSetData, 'terrains'>]> = []
  for (const [spriteSetId, resource] of mapResource.getAllSpriteSetResources()) {
    if (resource.data) entries.push([spriteSetId, resource.data])
  }
  return terrainCatalogOf(entries)
}

/** Everything one planning pass needs. One object because the pieces travel together. */
export interface TerrainPlanRequest {
  readonly editor: MapEditorComponent
  readonly layerId: string
  readonly catalog: TerrainCatalog
  /** Map extent — cells beyond it count as the same terrain, so water runs off the edge (§3.1). */
  readonly bounds?: TerrainBounds
  readonly intents: readonly TerrainPaintIntent[]
}

/** What the planner found. */
export interface TerrainPlan {
  /** Only the cells whose sprite list actually changed. Empty means "this edit is a no-op". */
  readonly cells: PaintCellsPayload['cells']
  /**
   * Whether a terrain member was added or removed. The signal
   * `TileEditorSystem` uses to pick `tile.cells` over the old
   * single-cell commands: an edit that touches no terrain keeps the
   * command, the undo label and the wire op it has always had.
   */
  readonly touchesTerrain: boolean
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * The shadow's ref as a payload slot. `animationId` is OMITTED rather
 * than set to `undefined` when there is none: the slot is compared
 * field by field and serialised onto the wire, so an absent key and an
 * explicit `undefined` must not be two ways to say the same thing — and
 * a revert has to restore the ref in exactly the shape it found it.
 */
function toSlot(ref: TileSpriteRef): TileSpriteSlot {
  if (!ref.animationId) return { spriteSetId: ref.spriteSetId, spriteId: ref.spriteId }
  return { spriteSetId: ref.spriteSetId, spriteId: ref.spriteId, animationId: ref.animationId }
}

/**
 * Plan a terrain-aware edit.
 *
 * Two passes, and the order is the point. Pass one applies the intents
 * to a scratch layer, writing a PROVISIONAL member sprite wherever a
 * terrain lands: which of its 29 pieces belongs there cannot be decided
 * while the neighbours are still being placed, and any member answers
 * "yes, this cell is Path" for the mask. Pass two then re-resolves
 * every terrain sprite in the touched cells and their ring against the
 * finished scratch state.
 */
export function planTerrainEdit(request: TerrainPlanRequest): TerrainPlan {
  const { editor, layerId, catalog, bounds, intents } = request
  const scratch = new Map<string, CellSprites>()
  const touched = new Set<string>()
  let touchesTerrain = false

  const read = (x: number, y: number): CellSprites => {
    const existing = scratch.get(cellKey(x, y))
    if (existing) return existing
    return getSpritesAt(editor, x, y, layerId).map(toSlot)
  }
  const write = (x: number, y: number, sprites: CellSprites): void => {
    scratch.set(cellKey(x, y), sprites)
    touched.add(cellKey(x, y))
  }
  const terrainOf = (sprite: TileSpriteSlot): TerrainData | undefined =>
    catalog.terrainOfSprite(sprite.spriteSetId, sprite.spriteId)

  // --- Pass one: the intents.
  for (const intent of intents) {
    if (intent.kind === 'terrain') {
      const terrain = catalog.terrainAt(intent.terrain)
      if (!terrain) continue
      // A terrain with no usable table would paint `null`; skip rather
      // than write a hole.
      const provisional = resolveTerrainTile(terrain, TERRAIN_MASK_FULL)
      if (provisional === null) continue
      touchesTerrain = true
      for (const cell of terrainFootprintCells(terrain, intent.x, intent.y)) {
        if (outside(cell.x, cell.y, bounds)) continue
        const before = read(cell.x, cell.y)
        write(cell.x, cell.y, placeTerrain(before, terrain, intent.terrain.spriteSetId, provisional, terrainOf))
      }
      continue
    }

    if (intent.kind === 'clear') {
      if (outside(intent.x, intent.y, bounds)) continue
      const before = read(intent.x, intent.y)
      const removed = before[before.length - 1]
      if (removed && terrainOf(removed)) touchesTerrain = true
      write(intent.x, intent.y, before.slice(0, -1))
      continue
    }

    if (outside(intent.x, intent.y, bounds)) continue
    const before = read(intent.x, intent.y)
    // A plain tile REPLACES the cell, exactly as `addSpriteToTileForLayer`
    // has always done. It counts as a terrain edit when it removes a
    // member — that is what closes a path around a flower stamped into
    // it (§6.2) — or when the placed tile is itself a member.
    if (before.some((sprite) => terrainOf(sprite)) || terrainOf(intent.sprite)) touchesTerrain = true
    write(intent.x, intent.y, [intent.sprite])
  }

  // --- Pass two: re-resolve the touched cells and the ring around them.
  const ring = new Set<string>()
  const ringCells: Array<{ x: number; y: number }> = []
  for (const key of touched) {
    const [x, y] = key.split(',').map(Number)
    if (x === undefined || y === undefined) continue
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (outside(nx, ny, bounds)) continue
        const nkey = cellKey(nx, ny)
        if (ring.has(nkey)) continue
        ring.add(nkey)
        ringCells.push({ x: nx, y: ny })
      }
    }
  }

  for (const cell of ringCells) {
    const before = read(cell.x, cell.y)
    let next: CellSprites | null = null
    for (let index = 0; index < before.length; index++) {
      const sprite = before[index]
      if (!sprite) continue
      const terrain = terrainOf(sprite)
      if (!terrain) continue
      const mask = terrainMaskAt(
        cell.x,
        cell.y,
        (nx, ny) => read(nx, ny).some((other) => terrainOf(other) === terrain),
        bounds,
      )
      const resolved = resolveTerrainTile(terrain, mask)
      // `members` (plain water) are counted but never re-chosen: a
      // resolve that lands back on the same id changes nothing, and one
      // that would move a hand-placed member into a variant is exactly
      // what §6.4 asks for.
      if (resolved === null || resolved === sprite.spriteId) continue
      next ??= [...before]
      next[index] = { ...sprite, spriteId: resolved }
    }
    if (next) write(cell.x, cell.y, next)
  }

  // --- The diff: only cells whose list actually changed.
  const cells: PaintCellsPayload['cells'] = []
  for (const key of scratch.keys()) {
    const [x, y] = key.split(',').map(Number)
    if (x === undefined || y === undefined) continue
    const previousSprites = getSpritesAt(editor, x, y, layerId).map(toSlot)
    const sprites = scratch.get(key) ?? []
    if (sameCellSprites(previousSprites, sprites)) continue
    cells.push({ tileX: x, tileY: y, sprites, previousSprites })
  }
  // Sorted so two peers planning the same edit produce byte-identical
  // payloads; `Map` iteration order is insertion order, which depends on
  // the order the intents arrived in.
  cells.sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX)

  return { cells, touchesTerrain }
}

/** Whether `(x, y)` lies outside the map. Without bounds nothing is outside. */
function outside(x: number, y: number, bounds?: TerrainBounds): boolean {
  if (!bounds) return false
  return x < 0 || y < 0 || x >= bounds.columns || y >= bounds.rows
}

/**
 * The cell's new sprite list once `terrain` lands in it.
 *
 * An `overlay` terrain keeps the floor — `[floor, terrainTile]`, where
 * the floor is the first sprite already in the cell that belongs to no
 * overlay terrain (§3.4). Anything opaque replaces the cell. A cell
 * that already holds this very terrain keeps its position in the list,
 * so repainting a path never reorders the stack under it.
 */
function placeTerrain(
  before: CellSprites,
  terrain: TerrainData,
  spriteSetId: string,
  provisionalSpriteId: number,
  terrainOf: (sprite: TileSpriteSlot) => TerrainData | undefined,
): CellSprites {
  const placed: TileSpriteSlot = { spriteSetId, spriteId: provisionalSpriteId }
  const existing = before.findIndex((sprite) => terrainOf(sprite) === terrain)
  if (existing >= 0) {
    const next = [...before]
    next[existing] = placed
    return next
  }
  if (!terrain.overlay) return [placed]
  const floor = before.find((sprite) => !terrainOf(sprite)?.overlay)
  return floor ? [floor, placed] : [placed]
}

/**
 * Plan + wrap in one step: the command a terrain-aware edit executes,
 * or `null` when it would change nothing.
 */
export function buildPaintCellsCommand(
  request: TerrainPlanRequest,
  label?: PaintCellsPayload['label'],
): PaintCellsCommand | null {
  const plan = planTerrainEdit(request)
  if (plan.cells.length === 0) return null
  return new PaintCellsCommand({ layerId: request.layerId, label, cells: plan.cells })
}

/** What the per-tool entry points below share. */
export interface TerrainToolRequest {
  readonly editor: MapEditorComponent
  readonly mapResource: MapResource | null | undefined
  readonly layerId: string
  readonly tileX: number
  readonly tileY: number
  readonly bounds?: TerrainBounds
}

/**
 * The pencil with a terrain armed: the brush's footprint at
 * `(tileX, tileY)` plus the re-resolved ring, as ONE command.
 *
 * `null` when the brush does not resolve (no such terrain in the map's
 * sprite sets) or when the cells already show exactly this.
 */
export function buildTerrainPaintCommand(
  request: TerrainToolRequest & { readonly terrain: TerrainAddress },
): PaintCellsCommand | null {
  const { editor, layerId, bounds, tileX, tileY, terrain } = request
  const catalog = terrainCatalogForMap(request.mapResource)
  if (!catalog.terrainAt(terrain)) return null
  return buildPaintCellsCommand(
    { editor, layerId, catalog, bounds, intents: [{ kind: 'terrain', x: tileX, y: tileY, terrain }] },
    { verb: 'paint', terrain },
  )
}

/**
 * The eraser over a cell whose top sprite belongs to a terrain: take
 * that one thing off and re-resolve the ring (§6.2).
 *
 * `null` means **this is not a terrain edit** — the cell's top sprite
 * belongs to no terrain, or the map defines none — and the caller keeps
 * the plain `tile.erase` it has always dispatched, which clears the
 * whole cell rather than peeling one sprite off it.
 */
export function buildTerrainEraseCommand(request: TerrainToolRequest): PaintCellsCommand | null {
  const { editor, layerId, bounds, tileX, tileY } = request
  const catalog = terrainCatalogForMap(request.mapResource)
  if (!catalog.hasTerrains) return null
  const plan = planTerrainEdit({
    editor,
    layerId,
    catalog,
    bounds,
    intents: [{ kind: 'clear', x: tileX, y: tileY }],
  })
  if (!plan.touchesTerrain || plan.cells.length === 0) return null
  return new PaintCellsCommand({ layerId, label: { verb: 'erase' }, cells: plan.cells })
}
