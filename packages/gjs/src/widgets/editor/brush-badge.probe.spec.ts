/**
 * The brush badge's three facts, read back from real pixels at both
 * sizes it ships at.
 *
 * For every (tool, plane) pair: the ring probe must carry that plane's
 * colour, the disc probe must be near-white (so a dark symbolic icon
 * reads on it over any tile), and the picture probe must carry the tile
 * — unmodified for Paint, dimmed for Select, and neither for Erase,
 * which draws a checkerboard instead. `brush-badge.geometry.spec.ts`
 * proves the same separations on paper without a display; this one needs
 * GTK and a display, so it runs on a workstation and skips (counted as
 * ignored, never as passed) under the node target and on a headless
 * runner. The renderer is loaded lazily: a static import of the widget
 * would pull `gi://Gtk` into the node bundle and fail at load.
 */

import { describe, expect, it } from '@gjsify/unit'

import { BADGE_SIZES, GHOST_OPACITY } from './brush-badge.geometry.ts'
import { GLYPH_PLANES } from './depth-glyph.geometry.ts'

/** GJS is the only target with GTK; the node target stubs `gi://` and must never evaluate the widget. */
const isGjs = typeof (globalThis as { imports?: unknown }).imports !== 'undefined'

/** Above this a probe pixel counts as coloured; the three plane colours sit at 150+. */
const COLOURED_CHROMA = 60
/** The disc is white at 92 % over the tile, so it clears this on any tile. */
const DISC_LUMINANCE = 190
/** A solid magenta stand-in tile: saturated, and none of the three plane colours. */
const TILE = { r: 200, g: 40, b: 180 }

export default async () => {
  await describe('PixelRpgBrushBadge — rendered pixels', async () => {
    const rig = isGjs ? await import('./pixel-probe.ts') : null
    const probe = isGjs ? await import('./brush-badge.probe.ts') : null
    if (!rig?.hasDisplay() || !probe) {
      await it.skip('needs GJS + a display: ring, disc and picture read back at 32 / 44 px')
      return
    }
    const outDir = rig.pngDir('BRUSH_BADGE_PNG_DIR')
    const tile = rig.solidPaintable(16, TILE)

    for (const size of Object.values(BADGE_SIZES)) {
      await it(`at ${size} px the ring carries the active plane's colour`, async () => {
        const seen: string[] = []
        for (const plane of GLYPH_PLANES) {
          const r = probe.renderBadgeProbe(
            'pencil',
            plane,
            size,
            tile,
            outDir ? `${outDir}/badge-pencil-${plane}-${size}.png` : undefined,
          )
          expect(rig.chroma(r.pixels.ring)).toBeGreaterThan(COLOURED_CHROMA)
          seen.push(`${r.pixels.ring.r},${r.pixels.ring.g},${r.pixels.ring.b}`)
        }
        // Three planes, three visibly different rings.
        expect(new Set(seen).size).toBe(3)
      })

      await it(`at ${size} px the tool disc is near-white on every tool`, async () => {
        const tools = ['select', 'pencil', 'fill', 'eraser', 'eyedropper', 'object'] as const
        for (const tool of tools) {
          const r = probe.renderBadgeProbe(tool, 'ground', size, tile)
          expect(rig.luminance(r.pixels.discFill)).toBeGreaterThan(DISC_LUMINANCE)
        }
      })

      await it(`at ${size} px the picture is the tile under Paint`, async () => {
        const r = probe.renderBadgeProbe('pencil', 'ground', size, tile)
        expect(Math.abs(r.pixels.picture.r - TILE.r)).toBeLessThan(12)
        expect(Math.abs(r.pixels.picture.g - TILE.g)).toBeLessThan(12)
        expect(Math.abs(r.pixels.picture.b - TILE.b)).toBeLessThan(12)
      })

      await it(`at ${size} px Select ghosts the tile and Erase drops it`, async () => {
        const paint = probe.renderBadgeProbe('pencil', 'ground', size, tile)
        const select = probe.renderBadgeProbe('select', 'ground', size, tile)
        const erase = probe.renderBadgeProbe('eraser', 'ground', size, tile)
        // The ghost is the same hue at a fraction of the strength, so it
        // is visibly weaker than the armed-paint picture …
        expect(rig.chroma(select.pixels.picture)).toBeLessThan(rig.chroma(paint.pixels.picture))
        expect(GHOST_OPACITY).toBeLessThan(1)
        // … and Erase shows no tile hue at all, only the grey checker.
        expect(rig.chroma(erase.pixels.picture)).toBeLessThan(COLOURED_CHROMA)
      })
    }
  })
}
