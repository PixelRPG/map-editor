/**
 * The depth glyph's three states, read back from real pixels at every
 * size it ships at — including the 14 px top-bar chip.
 *
 * For each highlighted plane the probe pixel of THAT plane's element
 * must carry a saturated colour and the other two probes must be grey,
 * so a screenshot can tell the states apart by which band is coloured.
 * `depth-glyph.geometry.spec.ts` proves the same on paper without a
 * display; this one needs GTK and a display, so it runs on a
 * workstation and skips (counted as ignored, never as passed) under
 * the node target and on a headless runner. The renderer is loaded
 * lazily: a static import of the widget would pull `gi://Gtk` into the
 * node bundle and fail at load.
 */

import { describe, expect, it } from '@gjsify/unit'

import { GLYPH_PLANES, GLYPH_SIZES } from './depth-glyph.geometry.ts'

/** GJS is the only target with GTK; the node target stubs `gi://` and must never evaluate the widget. */
const isGjs = typeof (globalThis as { imports?: unknown }).imports !== 'undefined'

/** Above this a probe pixel counts as coloured; below it as grey. The plane colours sit at 150+. */
const COLOURED_CHROMA = 60
const GREY_CHROMA = 24

export default async () => {
  await describe('PixelRpgDepthGlyph — rendered pixels', async () => {
    const rig = isGjs ? await import('./pixel-probe.ts') : null
    const probe = isGjs ? await import('./depth-glyph.probe.ts') : null
    if (!rig?.hasDisplay() || !probe) {
      await it.skip('needs GJS + a display: colours the highlighted band only, at 40 / 24 / 14 px')
      return
    }
    const outDir = rig.pngDir('DEPTH_GLYPH_PNG_DIR')

    for (const size of Object.values(GLYPH_SIZES)) {
      await it(`at ${size} px, exactly the highlighted plane's band carries colour`, async () => {
        for (const plane of GLYPH_PLANES) {
          const result = probe.renderGlyphProbe(
            plane,
            size,
            outDir ? `${outDir}/glyph-${plane}-${size}.png` : undefined,
          )
          expect(rig.chroma(result.pixels[plane])).toBeGreaterThan(COLOURED_CHROMA)
          for (const other of GLYPH_PLANES.filter((p) => p !== plane)) {
            expect(rig.chroma(result.pixels[other])).toBeLessThan(GREY_CHROMA)
          }
        }
      })
    }

    await it('uses three different colours for the three planes', async () => {
      const hues = GLYPH_PLANES.map((plane) => {
        const { r, g, b } = probe.renderGlyphProbe(plane, GLYPH_SIZES.row).pixels[plane]
        return `${r},${g},${b}`
      })
      expect(new Set(hues).size).toBe(3)
    })
  })
}
