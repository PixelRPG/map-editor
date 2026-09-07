/**
 * The brush badge's claim is that one square can carry three facts —
 * which tile, which tool, which layer — without any of them hiding
 * another. That is geometry, so it is proved here without a display;
 * `brush-badge.probe.spec.ts` reads the same points back out of real
 * pixels.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  BADGE_SIZES,
  brushBadgeGeometry,
  brushBadgeProbes,
  discCoverage,
  discFitsInside,
  MAX_DISC_COVERAGE,
  pixelInDisc,
  pixelInIconBox,
  pixelInRing,
  subjectFor,
  TOOL_ICONS,
} from './brush-badge.geometry.ts'

const SIZES = Object.values(BADGE_SIZES)

export default async () => {
  await describe('brushBadgeGeometry', async () => {
    for (const size of SIZES) {
      await it(`at ${size} px the disc covers at most ${MAX_DISC_COVERAGE * 100} % of the square`, async () => {
        expect(discCoverage(brushBadgeGeometry(size))).toBeLessThan(MAX_DISC_COVERAGE)
      })

      await it(`at ${size} px the disc and its outline fit inside the square`, async () => {
        expect(discFitsInside(brushBadgeGeometry(size))).toBe(true)
      })

      await it(`at ${size} px the icon box is inside the disc`, async () => {
        const g = brushBadgeGeometry(size)
        const half = g.icon.w / 2
        // The icon's corner is the far point; keep it within the radius.
        expect(Math.hypot(half, half)).toBeLessThan(g.disc.r)
      })

      await it(`at ${size} px the picture fills the whole square`, async () => {
        const g = brushBadgeGeometry(size)
        expect(g.picture.w).toBe(size)
        expect(g.picture.h).toBe(size)
      })
    }
  })

  await describe('brushBadgeProbes', async () => {
    for (const size of SIZES) {
      await it(`at ${size} px the ring probe is in the border band and clear of the disc`, async () => {
        const g = brushBadgeGeometry(size)
        const { ring } = brushBadgeProbes(size)
        expect(pixelInRing(g, ring.x, ring.y)).toBe(true)
        expect(pixelInDisc(g.disc, ring.x, ring.y)).toBe(false)
      })

      await it(`at ${size} px the disc probe is inside the disc and off the icon`, async () => {
        const g = brushBadgeGeometry(size)
        const { discFill } = brushBadgeProbes(size)
        expect(pixelInDisc(g.disc, discFill.x, discFill.y)).toBe(true)
        expect(pixelInIconBox(g, discFill.x, discFill.y)).toBe(false)
      })

      await it(`at ${size} px the picture probe is clear of both the ring and the disc`, async () => {
        const g = brushBadgeGeometry(size)
        const { picture } = brushBadgeProbes(size)
        expect(pixelInRing(g, picture.x, picture.y)).toBe(false)
        expect(pixelInDisc(g.disc, picture.x, picture.y)).toBe(false)
      })

      await it(`at ${size} px the three probes are three distinct pixels`, async () => {
        const p = brushBadgeProbes(size)
        const keys = new Set(Object.values(p).map(({ x, y }) => `${x},${y}`))
        expect(keys.size).toBe(3)
      })
    }
  })

  await describe('subjectFor', async () => {
    await it('draws the tile for the tools that lay one', async () => {
      expect(subjectFor('pencil')).toBe('tile')
      expect(subjectFor('fill')).toBe('tile')
      expect(subjectFor('eyedropper')).toBe('tile')
    })

    await it('draws an empty checkerboard for Erase, because it lays nothing', async () => {
      expect(subjectFor('eraser')).toBe('empty')
    })

    await it('ghosts the tile under Select, because Select lays nothing either', async () => {
      expect(subjectFor('select')).toBe('ghost')
    })

    await it('draws the armed object under the Object tool', async () => {
      expect(subjectFor('object')).toBe('object')
    })
  })

  await describe('TOOL_ICONS', async () => {
    await it('names a symbolic icon for every tool the badge can show', async () => {
      const tools = ['select', 'pencil', 'fill', 'eraser', 'eyedropper', 'object'] as const
      for (const tool of tools) {
        expect(TOOL_ICONS[tool].endsWith('-symbolic')).toBe(true)
      }
      expect(new Set(Object.values(TOOL_ICONS)).size).toBe(tools.length)
    })
  })
}
