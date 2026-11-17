import Gdk from '@girs/gdk-4.0'

import { type SheetGrid, spanOfIndex, spanRect } from './tile-sheet.geometry.ts'

/**
 * What a sprite sheet's alpha channel says about each tile.
 *
 * One question, asked of the picture rather than of the author: is this
 * tile solid artwork, or does it have holes? That is what decides
 * whether a terrain paints over the ground or replaces it
 * (`TerrainData.overlay`, TERRAIN.md § 5.2) — a shore tile is grass with
 * a bite out of it, a dirt tile is dirt edge to edge. Asking the author
 * would be asking them to look at the alpha channel for us.
 *
 * The pack importer (`scripts/import-kenney-roguelike.mjs`) derives the
 * same flag from the same bytes, by decoding the PNG itself; this is the
 * in-app path, over a texture GTK already has in memory.
 */
export interface SheetAlpha {
  /** Every pixel of tile `index` is fully opaque. */
  isOpaque(index: number): boolean
  /** At least one pixel of tile `index` is not fully opaque. */
  hasTransparency(index: number): boolean
}

/** Alpha below this counts as a hole — a hair off 255 is a lossy encoder, not a gap. */
const OPAQUE_FLOOR = 250

/**
 * Download `texture` once and index its alpha by tile.
 *
 * Eager on the whole sheet rather than per tile, because the caller
 * (the definition dialog, on Create) asks about a dozen tiles at once
 * and a `TextureDownloader` per question would decode the sheet a dozen
 * times. `null` when the texture cannot be read at all, which the caller
 * treats as "cannot tell" rather than as "no holes".
 */
export function readSheetAlpha(texture: Gdk.Texture, grid: SheetGrid): SheetAlpha | null {
  let data: Uint8Array
  let stride: number
  try {
    const downloader = Gdk.TextureDownloader.new(texture)
    downloader.set_format(Gdk.MemoryFormat.R8G8B8A8)
    const [bytes, rowStride] = downloader.download_bytes()
    data = bytes.toArray()
    stride = rowStride
  } catch {
    return null
  }

  const scan = (index: number): { opaque: boolean; holed: boolean } => {
    const rect = spanRect(grid, 1, spanOfIndex(grid, index))
    if (!rect) return { opaque: false, holed: false }
    let opaque = true
    let holed = false
    const right = Math.min(rect.x + rect.width, grid.imageWidth)
    const bottom = Math.min(rect.y + rect.height, grid.imageHeight)
    for (let y = rect.y; y < bottom; y++) {
      for (let x = rect.x; x < right; x++) {
        const alpha = data[y * stride + x * 4 + 3]
        if (alpha >= OPAQUE_FLOOR) continue
        opaque = false
        holed = true
        return { opaque, holed }
      }
    }
    return { opaque, holed }
  }

  const cache = new Map<number, { opaque: boolean; holed: boolean }>()
  const read = (index: number) => {
    const hit = cache.get(index)
    if (hit) return hit
    const answer = scan(index)
    cache.set(index, answer)
    return answer
  }

  return {
    isOpaque: (index) => read(index).opaque,
    hasTransparency: (index) => read(index).holed,
  }
}
