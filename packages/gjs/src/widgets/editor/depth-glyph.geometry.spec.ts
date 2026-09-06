/**
 * The depth glyph's promise is that its three states are telling apart
 * at every size it is used at, down to the 14 px top-bar chip: the
 * highlighted element sits in a different vertical band each time
 * (bottom slab / middle-right block / top slab). This pins that claim
 * on the geometry the widget draws from — for each plane, the probe
 * pixel is fully inside its own element and touches no other drawn
 * shape — so a change to a coordinate that would make two states look
 * alike fails here, without a display. `depth-glyph.probe.gjs.spec.ts`
 * reads the same pixels back from a real render.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  depthGlyphGeometry,
  depthGlyphProbes,
  GLYPH_PLANES,
  GLYPH_SIZES,
  headBounds,
  highlightRect,
  pixelInside,
  pixelOverlaps,
} from './depth-glyph.geometry.ts'

export default async () => {
  await describe('depthGlyphGeometry', async () => {
    await it('stacks the elements in three vertical bands: roof, block, ground slab', async () => {
      const g = depthGlyphGeometry(100)
      expect(g.overlay.y + g.overlay.h).toBeLessThan(g.hero.y)
      expect(g.hero.y + g.hero.h).toBeLessThanOrEqual(g.ground.y + g.ground.h)
      expect(g.hero.y).toBeGreaterThan(g.overlay.y + g.overlay.h)
      // The block sits beside the hero, not on it.
      expect(g.hero.x).toBeGreaterThan(g.heroBox.x + g.heroBox.w)
    })

    await it('lets the roof slab cut the top of the silhouette head', async () => {
      const g = depthGlyphGeometry(100)
      const head = headBounds(g)
      expect(head.y).toBeLessThan(g.overlay.y + g.overlay.h)
    })

    await it('scales every element with the size', async () => {
      const small = depthGlyphGeometry(14)
      const large = depthGlyphGeometry(40)
      for (const plane of GLYPH_PLANES) {
        const a = highlightRect(small, plane)
        const b = highlightRect(large, plane)
        expect(b.x / a.x).toBeCloseTo(40 / 14, 6)
        expect(b.h / a.h).toBeCloseTo(40 / 14, 6)
      }
    })
  })

  await describe('depthGlyphProbes', async () => {
    for (const size of Object.values(GLYPH_SIZES)) {
      await it(`at ${size} px, each plane's probe pixel is inside its own element and touches nothing else`, async () => {
        const g = depthGlyphGeometry(size)
        const probes = depthGlyphProbes(size)
        const otherShapes = (plane: (typeof GLYPH_PLANES)[number]) => [
          ...GLYPH_PLANES.filter((p) => p !== plane).map((p) => highlightRect(g, p)),
          g.heroBody,
          headBounds(g),
        ]
        for (const plane of GLYPH_PLANES) {
          const { x, y } = probes[plane]
          expect(pixelInside(highlightRect(g, plane), x, y)).toBe(true)
          for (const shape of otherShapes(plane)) expect(pixelOverlaps(shape, x, y)).toBe(false)
        }
      })
    }

    await it('puts the three probes in three distinct rows, top to bottom: overlay, hero, ground', async () => {
      const probes = depthGlyphProbes(GLYPH_SIZES.chip)
      expect(probes.overlay.y).toBeLessThan(probes.hero.y)
      expect(probes.hero.y).toBeLessThan(probes.ground.y)
    })
  })
}
