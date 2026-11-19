import { Color, type ExcaliburGraphicsContext, Sprite, vec, type Tile, type TileMap } from 'excalibur'
import type { BakedChunksComponent, ChunkSlot } from '../components/baked-chunks.component.ts'
import { chunkRangeOfRect, tileRangeOfChunk } from './tile-chunks.ts'

/**
 * Baking a tile plane into per-chunk textures.
 *
 * A stock `TileMap` submits one image per graphic per visible tile every
 * frame — ~14,000 on the large bench map, ~98,000 zoomed out
 * (`docs/design/excalibur-1.md`). Here each 16×16-tile chunk is drawn
 * ONCE into a canvas, and a frame costs one quad per visible chunk.
 *
 * What cannot be baked is drawn live, exactly as before: a cell holding
 * an animation, or any graphic that is not a plain tile-sized sprite
 * (taller than a cell, flipped, tinted, offset) — baking those would clip
 * them at the chunk border or freeze them. A cell with ANY such graphic
 * goes live as a whole, so the layer order inside it is kept.
 *
 * Invalidation is a dirty set on {@link BakedChunksComponent}, filled by
 * the graphics rebuild paths. Dirty chunks are re-baked on the draw that
 * first sees them, nearest the view centre first, within a time budget per
 * frame (at least one chunk). A chunk that has never been baked shows a flat
 * placeholder colour (average of its tile centres) until its turn comes, so
 * the map never has a hole and never falls back to per-tile drawing.
 */

/** Milliseconds of a frame spent baking; one chunk is always baked. */
const BAKE_BUDGET_MS = 12

interface TileMapInternals {
  _token: number
  _engine?: { screen: { getWorldBounds(): { left: number; top: number; right: number; bottom: number } } }
}

function isBakeable(
  graphic: unknown,
  tile: Tile,
  index: number,
  tileWidth: number,
  tileHeight: number,
): graphic is Sprite {
  if (!(graphic instanceof Sprite)) return false
  if (!graphic.image.isLoaded) return false
  if (graphic.tint || graphic.rotation !== 0 || graphic.flipHorizontal || graphic.flipVertical) return false
  if (graphic.opacity !== 1) return false
  if (graphic.scale.x !== 1 || graphic.scale.y !== 1) return false
  if (graphic.width !== tileWidth || graphic.height !== tileHeight) return false
  const offset = tile.getGraphicsOffsets()[index]
  return !offset || (offset.x === 0 && offset.y === 0)
}

function drawTileLive(map: TileMap, tile: Tile, ctx: ExcaliburGraphicsContext, elapsed: number): void {
  const graphics = tile.getGraphics()
  const offsets = tile.getGraphicsOffsets()
  const token = (map as unknown as TileMapInternals)._token
  for (let i = 0; i < graphics.length; i++) {
    const graphic = graphics[i]
    if (!graphic) continue
    const offset = offsets[i]
    if ('tick' in graphic) (graphic as unknown as { tick(e: number, t: number): void }).tick(elapsed, token)
    const offsetY = map.renderFromTopOfGraphic ? 0 : graphic.height - map.tileHeight
    graphic.draw(ctx, tile.x * map.tileWidth + offset.x, tile.y * map.tileHeight - offsetY + offset.y)
  }
}

/** Average colour of a chunk, from one pixel per tile centre: cheap enough to run for every chunk. */
function placeholderOf(map: TileMap, baked: BakedChunksComponent, chunkX: number, chunkY: number): Color | null {
  const range = tileRangeOfChunk(baked.grid, chunkX, chunkY, baked.scratchTiles)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let ty = range.y0; ty < range.y1; ty++) {
    for (let tx = range.x0; tx < range.x1; tx++) {
      const graphics = map.getTile(tx, ty)?.getGraphics()
      if (!graphics) continue
      for (let i = graphics.length - 1; i >= 0; i--) {
        const sprite = graphics[i]
        if (!(sprite instanceof Sprite) || !sprite.image.isLoaded) continue
        const src = pixelsOf(sprite.image.image as unknown as CanvasImageSource & { width: number; height: number })
        if (!src) continue
        const v = sprite.sourceView
        const at = ((v.y + (v.height >> 1)) * src.width + v.x + (v.width >> 1)) * 4
        if (src.data.data[at + 3] < 128) continue
        r += src.data.data[at]
        g += src.data.data[at + 1]
        b += src.data.data[at + 2]
        n++
        break
      }
    }
  }
  return n === 0 ? null : Color.fromRGB(Math.round(r / n), Math.round(g / n), Math.round(b / n))
}

interface SheetPixels {
  width: number
  data: ImageData
  words: Uint32Array
}

const sourcePixels = new WeakMap<object, SheetPixels | null>()

/**
 * Pixels of a sprite sheet, read once. Drawing tile by tile with
 * `drawImage` would make the GJS canvas convert the WHOLE sheet per call
 * (~370 ms per chunk), so chunks are composed from this copy instead.
 */
function pixelsOf(image: CanvasImageSource & { width: number; height: number }): SheetPixels | null {
  const cached = sourcePixels.get(image)
  if (cached !== undefined) return cached
  let data: SheetPixels | null = null
  const canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(image, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const bytes = img.data
    data = { width: img.width, data: img, words: new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length >> 2) }
  }
  sourcePixels.set(image, data)
  return data
}

/**
 * Source-over one tile-sized block into the chunk buffer. Little-endian
 * RGBA words keep alpha in the top byte: opaque and empty pixels (almost
 * all of them) are one word copy or skip; only soft edges blend per byte.
 */
function blit(
  src: SheetPixels,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dst32: Uint32Array,
  dst8: Uint8ClampedArray,
  dstStride: number,
  dx: number,
  dy: number,
): void {
  const s32 = src.words
  const s8 = src.data.data
  for (let y = 0; y < h; y++) {
    let si = (sy + y) * src.width + sx
    let di = (dy + y) * dstStride + dx
    for (let x = 0; x < w; x++, si++, di++) {
      const word = s32[si]
      const a = word >>> 24
      if (a === 0) continue
      if (a === 255 || dst32[di] >>> 24 === 0) {
        dst32[di] = word
        continue
      }
      const sb = si << 2
      const db = di << 2
      const da = dst8[db + 3]
      const outA = a + (da * (255 - a)) / 255
      dst8[db] = (s8[sb] * a + (dst8[db] * da * (255 - a)) / 255) / outA
      dst8[db + 1] = (s8[sb + 1] * a + (dst8[db + 1] * da * (255 - a)) / 255) / outA
      dst8[db + 2] = (s8[sb + 2] * a + (dst8[db + 2] * da * (255 - a)) / 255) / outA
      dst8[db + 3] = outA
    }
  }
}

let scratch: ImageData | null = null
/** One reusable, zeroed pixel buffer per chunk size: no allocation per bake. */
function scratchBuffer(ctx: CanvasRenderingContext2D | null, width: number, height: number): ImageData | null {
  if (!scratch || scratch.width !== width || scratch.height !== height)
    scratch = ctx?.createImageData(width, height) ?? null
  else scratch.data.fill(0)
  return scratch
}

/** Compose one chunk's static tiles into its slot; collects the tiles that must stay live. */
export function bakeChunk(map: TileMap, baked: BakedChunksComponent, chunkX: number, chunkY: number): void {
  const grid = baked.grid
  const index = chunkY * grid.chunkColumns + chunkX
  const range = tileRangeOfChunk(grid, chunkX, chunkY, baked.scratchTiles)
  const tw = map.tileWidth
  const th = map.tileHeight
  const width = (range.x1 - range.x0) * tw
  const height = (range.y1 - range.y0) * th

  let slot = baked.slots[0][index]
  if (!slot) {
    slot = { canvas: null, live: [], width, height, placeholder: null }
    baked.slots[0][index] = slot
  }
  slot.live.length = 0
  slot.width = width
  slot.height = height

  const canvas = slot.canvas ?? (document.createElement('canvas') as HTMLCanvasElement)
  canvas.width = width
  canvas.height = height
  const ctx2d = canvas.getContext('2d')
  let buffer: ImageData | null = null
  let dst32: Uint32Array | null = null
  for (let ty = range.y0; ty < range.y1; ty++) {
    for (let tx = range.x0; tx < range.x1; tx++) {
      const tile = map.getTile(tx, ty)
      if (!tile) continue
      const graphics = tile.getGraphics()
      if (graphics.length === 0) continue
      let allStatic = true
      for (let g = 0; g < graphics.length; g++) {
        if (!isBakeable(graphics[g], tile, g, tw, th)) {
          allStatic = false
          break
        }
      }
      if (!allStatic) {
        slot.live.push(tile)
        continue
      }
      for (let g = 0; g < graphics.length; g++) {
        const sprite = graphics[g] as Sprite
        const src = pixelsOf(sprite.image.image as unknown as CanvasImageSource & { width: number; height: number })
        if (!src) continue
        if (!buffer) {
          buffer = scratchBuffer(ctx2d, width, height)
          if (!buffer) continue
          dst32 = new Uint32Array(buffer.data.buffer, buffer.data.byteOffset, buffer.data.length >> 2)
        }
        const view = sprite.sourceView
        blit(
          src,
          view.x,
          view.y,
          tw,
          th,
          dst32 as Uint32Array,
          buffer.data,
          width,
          (tx - range.x0) * tw,
          (ty - range.y0) * th,
        )
      }
    }
  }
  if (buffer && ctx2d) {
    ctx2d.putImageData(buffer, 0, 0)
    // Pixel art must stay unfiltered, and the texture loader re-uploads
    // a canvas only when told its pixels changed.
    canvas.setAttribute('filtering', 'Pixel')
    canvas.setAttribute('forceUpload', 'true')
    slot.canvas = canvas
  } else {
    slot.canvas = null
  }
  slot.placeholder = null
  baked.dirty.delete(index)
}

/** The baked replacement for `TileMap.draw`'s tile loop. */
export function drawBakedChunks(
  map: TileMap,
  baked: BakedChunksComponent,
  ctx: ExcaliburGraphicsContext,
  elapsed: number,
): void {
  const engine = (map as unknown as TileMapInternals)._engine
  if (!engine) return
  const bounds = engine.screen.getWorldBounds()
  const grid = baked.grid
  const view = chunkRangeOfRect(
    grid,
    map.tileWidth,
    map.tileHeight,
    bounds.left - map.pos.x,
    bounds.top - map.pos.y,
    bounds.right - map.pos.x,
    bounds.bottom - map.pos.y,
    baked.scratchChunks,
  )
  const chunkW = grid.chunkTiles * map.tileWidth
  const chunkH = grid.chunkTiles * map.tileHeight

  // Bake the dirty visible chunks nearest the viewport centre first, so
  // whatever is still missing is at the edge of the screen.
  const pending = baked.scratchPending
  pending.length = 0
  if (baked.dirty.size > 0) {
    const centreX = (bounds.left + bounds.right) / 2 - map.pos.x
    const centreY = (bounds.top + bounds.bottom) / 2 - map.pos.y
    for (let cy = view.y0; cy < view.y1; cy++) {
      for (let cx = view.x0; cx < view.x1; cx++) {
        const index = cy * grid.chunkColumns + cx
        if (!baked.dirty.has(index)) continue
        const dx = (cx + 0.5) * chunkW - centreX
        const dy = (cy + 0.5) * chunkH - centreY
        baked.scratchDistance[index] = dx * dx + dy * dy
        pending.push(index)
      }
    }
  }
  if (pending.length > 0) {
    pending.sort((a, b) => baked.scratchDistance[a] - baked.scratchDistance[b])
    const started = performance.now()
    for (let i = 0; i < pending.length; i++) {
      const index = pending[i]
      const cx = index % grid.chunkColumns
      const cy = Math.floor(index / grid.chunkColumns)
      if (i > 0 && performance.now() - started > BAKE_BUDGET_MS) {
        // Out of time: a never-baked chunk gets its flat colour instead.
        const slot = baked.slots[0][index]
        if (!slot || (!slot.canvas && !slot.placeholder)) {
          const range = tileRangeOfChunk(grid, cx, cy, baked.scratchTiles)
          const fresh: ChunkSlot = slot ?? {
            canvas: null,
            live: [],
            width: (range.x1 - range.x0) * map.tileWidth,
            height: (range.y1 - range.y0) * map.tileHeight,
            placeholder: null,
          }
          fresh.placeholder = placeholderOf(map, baked, cx, cy)
          baked.slots[0][index] = fresh
        }
        continue
      }
      bakeChunk(map, baked, cx, cy)
    }
  }

  for (let cy = view.y0; cy < view.y1; cy++) {
    for (let cx = view.x0; cx < view.x1; cx++) {
      const index = cy * grid.chunkColumns + cx
      const slot: ChunkSlot | undefined = baked.slots[0][index]
      if (!slot) continue
      if (!slot.canvas && slot.placeholder)
        ctx.drawRectangle(vec(cx * chunkW, cy * chunkH), slot.width, slot.height, slot.placeholder)
      if (slot.canvas)
        ctx.drawImage(slot.canvas, 0, 0, slot.width, slot.height, cx * chunkW, cy * chunkH, slot.width, slot.height)
      for (let i = 0; i < slot.live.length; i++) drawTileLive(map, slot.live[i], ctx, elapsed)
    }
  }
}
