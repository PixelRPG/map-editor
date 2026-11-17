import type { Scene } from 'excalibur'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { addSpriteToTileForLayer, removeSpritesFromTileForLayer } from '../services/layer.manager.ts'
import { setSpritesAt } from '../services/map-editor-shadow.service.ts'
import { rebuildAllTileGraphics } from '../services/tile-graphics.manager.ts'
import { findTileMapForLayer } from '../services/tile-paint.service.ts'
import type { Command, CommandFootprint } from './types.ts'

/**
 * Payload of {@link PaintTileCommand}. All identifiers are stable
 * across save/load + cross-peer.
 */
export interface PaintTilePayload {
  layerId: string
  tileX: number
  tileY: number
  /** Global tile id (sprite-set local index + `firstGid`). */
  spriteId: number
  /**
   * Previous sprite refs on the targeted tile + layer, captured at
   * apply time. Used by `revert` to restore the prior state. `[]`
   * means the tile was empty before this paint.
   */
  previousSprites: Array<{ spriteSetId: string; spriteId: number; animationId?: string }>
}

/**
 * Painting a tile = setting the sprite at (tileX, tileY) on `layerId`
 * to `spriteId`, replacing any prior sprites on the same (tile, layer)
 * slot. Revert restores the captured `previousSprites`.
 *
 * Construction note: the caller is responsible for populating
 * `previousSprites` from `MapEditorComponent.getSpritesForTileAndLayer`
 * **before** mutating. The command does NOT capture the previous state
 * itself — that would require running side effects in the constructor,
 * which breaks the "command is pure data" contract.
 */
export class PaintTileCommand implements Command<PaintTilePayload> {
  static readonly KIND = 'tile.paint'
  readonly kind = PaintTileCommand.KIND

  constructor(readonly payload: PaintTilePayload) {}

  get label(): string {
    return `Paint tile (${this.payload.tileX}, ${this.payload.tileY})`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    addSpriteToTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId, this.payload.spriteId)
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    writeCellSprites(ctx, tile, this.payload.layerId, this.payload.previousSprites)
  }

  footprint(): CommandFootprint {
    return { layerId: this.payload.layerId, tiles: [{ tileX: this.payload.tileX, tileY: this.payload.tileY }] }
  }
}

/**
 * Erasing a tile = clearing the sprites at (tileX, tileY) on `layerId`.
 * Revert restores the captured `previousSprites`. Same construction
 * contract as `PaintTileCommand` for the previous-state capture.
 */
export class EraseTileCommand implements Command<Omit<PaintTilePayload, 'spriteId'>> {
  static readonly KIND = 'tile.erase'
  readonly kind = EraseTileCommand.KIND

  constructor(readonly payload: Omit<PaintTilePayload, 'spriteId'>) {}

  get label(): string {
    return `Erase tile (${this.payload.tileX}, ${this.payload.tileY})`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    removeSpritesFromTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId)
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    writeCellSprites(ctx, tile, this.payload.layerId, this.payload.previousSprites)
  }

  footprint(): CommandFootprint {
    return { layerId: this.payload.layerId, tiles: [{ tileX: this.payload.tileX, tileY: this.payload.tileY }] }
  }
}

/**
 * Payload of {@link FillTileCommand}. A single flood-fill spans many
 * cells but is one undo step / one collab op — each cell carries its
 * own `previousSprites` snapshot so revert restores the exact prior
 * state per tile.
 */
export interface FillTilePayload {
  layerId: string
  /** Global tile id to flood with (always `> 0` — fill is a paint tool, not an eraser). */
  spriteId: number
  cells: Array<{ tileX: number; tileY: number; previousSprites: PaintTilePayload['previousSprites'] }>
}

/**
 * Bucket-fill: paint `spriteId` onto every cell in `cells` (the
 * contiguous region resolved by {@link computeFloodFillRegion}) on
 * `layerId`, as one atomic command. Apply/revert resolve the plane
 * tilemap once and loop — mirroring {@link PaintTileCommand} per cell —
 * so a fill is a single entry on the undo stack and a single op on the
 * collab log.
 */
export class FillTileCommand implements Command<FillTilePayload> {
  static readonly KIND = 'tile.fill'
  readonly kind = FillTileCommand.KIND

  constructor(readonly payload: FillTilePayload) {}

  get label(): string {
    return `Fill ${this.payload.cells.length} tiles`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    for (const cell of this.payload.cells) {
      const tile = ctx.tileMap.getTile(cell.tileX, cell.tileY)
      if (!tile) continue
      addSpriteToTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId, this.payload.spriteId)
    }
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    for (const cell of this.payload.cells) {
      const tile = ctx.tileMap.getTile(cell.tileX, cell.tileY)
      if (!tile) continue
      writeCellSprites(ctx, tile, this.payload.layerId, cell.previousSprites)
    }
  }

  footprint(): CommandFootprint {
    return {
      layerId: this.payload.layerId,
      tiles: this.payload.cells.map((cell) => ({ tileX: cell.tileX, tileY: cell.tileY })),
    }
  }
}

/** What a cell's sprite list holds — the shadow state's ref, minus the layer it is on. */
export type CellSprites = PaintTilePayload['previousSprites']

/**
 * Payload of {@link PaintCellsCommand}: the general per-cell edit.
 *
 * Where {@link FillTilePayload} writes ONE sprite id to many cells,
 * this writes a whole sprite LIST to each cell independently — which is
 * what a stamp (a different tile per cell) and a terrain brush (a
 * resolved edge piece per cell, over the floor it keeps, §3.4) both
 * need and what a fill cannot express.
 *
 * Sprites are **refs**, not global tile ids: the terrain planner
 * resolves within one sprite set, and `previousSprites` has always been
 * refs, so one form on both sides of the cell removes the only
 * conversion that could disagree with itself.
 */
export interface PaintCellsPayload {
  layerId: string
  /**
   * Undo-label hint only — never read by `apply`/`revert`. The terrain
   * is named so the stack reads "Paint Path" instead of "Paint 9 tiles".
   */
  label?: { verb: 'paint' | 'erase' | 'fill' | 'stamp'; terrain?: { spriteSetId: string; terrainId: string } }
  cells: Array<{
    tileX: number
    tileY: number
    /** The cell's sprite list AFTER the edit. `[]` erases the cell on this layer. */
    sprites: CellSprites
    previousSprites: CellSprites
  }>
}

/**
 * Paint an arbitrary set of cells, each with its own sprite list, as
 * ONE command — the vocabulary behind the stamp brush (REDESIGN §5.3),
 * the terrain brush and its re-resolved ring (TERRAIN §7.1), and the
 * one-finger stroke (T7).
 *
 * One command for the whole set: a single undo step, and a single op on
 * the collab log (REDESIGN §8, "one tile-paint command per stroke").
 * Per-cell `previousSprites` so revert restores the exact prior state
 * of every tile it covered.
 *
 * **The payload carries resolved tiles.** A peer applies data; it never
 * re-runs the terrain resolver, so two peers cannot disagree because
 * one of them holds a tileset edit the other has not received yet
 * (TERRAIN §7.1).
 */
export class PaintCellsCommand implements Command<PaintCellsPayload> {
  static readonly KIND = 'tile.cells'
  readonly kind = PaintCellsCommand.KIND

  constructor(readonly payload: PaintCellsPayload) {}

  get label(): string {
    const verb = this.payload.label?.verb ?? 'paint'
    const what = this.payload.label?.terrain?.terrainId
    const head = verb.charAt(0).toUpperCase() + verb.slice(1)
    return what ? `${head} ${what}` : `${head} ${this.payload.cells.length} tiles`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    for (const cell of this.payload.cells) {
      const tile = ctx.tileMap.getTile(cell.tileX, cell.tileY)
      if (!tile) continue
      writeCellSprites(ctx, tile, this.payload.layerId, cell.sprites)
    }
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene, this.payload.layerId)
    if (!ctx) return
    for (const cell of this.payload.cells) {
      const tile = ctx.tileMap.getTile(cell.tileX, cell.tileY)
      if (!tile) continue
      writeCellSprites(ctx, tile, this.payload.layerId, cell.previousSprites)
    }
  }

  footprint(): CommandFootprint {
    return {
      layerId: this.payload.layerId,
      tiles: this.payload.cells.map((cell) => ({ tileX: cell.tileX, tileY: cell.tileY })),
    }
  }
}

/**
 * Put EXACTLY this sprite list on `(tile, layerId)` — the one write
 * every command in this file ends in, for apply and for revert alike.
 *
 * An empty list goes through `removeSpritesFromTileForLayer`, which
 * both clears the shadow state and triggers the graphics rebuild.
 *
 * A non-empty list is written to the shadow directly via `setSpritesAt`
 * (the layer-manager helpers can only add a SINGLE sprite or clear all,
 * never "set this exact array" — the limitation that kept an `overlay`
 * terrain's `[floor, pathTile]` cell unexpressible), and then the
 * graphics rebuild is called **by hand**. Forgetting that call was a
 * real bug: the shadow state updated but the canvas kept showing the
 * painted sprite, so undo *appeared* to do nothing.
 */
function writeCellSprites(
  ctx: { tileMap: import('excalibur').TileMap; mapResource: import('../resource/MapResource.ts').MapResource },
  tile: import('excalibur').Tile,
  layerId: string,
  sprites: CellSprites,
): void {
  if (sprites.length === 0) {
    removeSpritesFromTileForLayer(ctx.tileMap, ctx.mapResource, tile, layerId)
    return
  }
  const editor = ctx.tileMap.get(MapEditorComponent)
  if (!editor) return
  setSpritesAt(editor, tile.x, tile.y, layerId, sprites)
  rebuildAllTileGraphics(ctx.tileMap, ctx.mapResource, tile)
  // A write can swap solid → walkable (or vice-versa); recompute so
  // collision matches what the user just saw.
  ctx.mapResource.refreshTileSolidFromEditor(ctx.tileMap, tile)
}

/**
 * Resolve the **plane-correct** `TileMap` + `MapResource` for the
 * command's target layer. A `MapScene` holds one tilemap per
 * `LayerPlane` (ground / hero / overlay — see
 * `TileMapPlaneComponent`), so "the" tilemap is ambiguous: an earlier
 * version of this helper grabbed the *first* tilemap in the scene,
 * which is always the ground plane (`buildPlaneTileMaps` adds
 * planes in ground → hero → overlay order). Every hero/overlay-layer
 * paint then mutated the wrong tilemap's shadow state — wrong render
 * z, and undo (whose `previousSprites` snapshot was read from the
 * plane-correct shadow that never saw the paint) erased earlier paints
 * instead of restoring them. Delegating to {@link findTileMapForLayer}
 * keeps this resolution identical to the interactive paths
 * (`TileEditorSystem`, `Engine.paintTileAt`).
 *
 * Returns `null` when the scene isn't a `MapScene` or isn't realised
 * yet (silent — commands may legitimately arrive before/after a map
 * is live). An unknown layer id or a missing plane tilemap is warned
 * explicitly and skipped: it is non-critical (a remote peer can paint
 * a layer the local map no longer has), but it must NOT silently fall
 * back to another plane's tilemap.
 */
function resolveContext(scene: Scene, layerId: string) {
  if (!(scene instanceof MapScene)) return null
  const mapResource = scene.mapResource
  if (!mapResource) return null
  const found = findTileMapForLayer(scene, layerId)
  if (!found) {
    console.warn(`[PaintTile] no plane tilemap resolves for layer "${layerId}" — command skipped`)
    return null
  }
  return { tileMap: found.tileMap, mapResource }
}
