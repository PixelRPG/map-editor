import { describe, expect, it } from '@gjsify/unit'

import type { SceneRect } from './atlas-canvas.geometry.ts'
import {
  ATLAS_ZOOM_MAX,
  ATLAS_ZOOM_MIN,
  CARD_MIN_SHORT_SIDE,
  cardPixelSize,
  centeredScroll,
  clampAtlasZoom,
  drawnExtent,
  drawnRects,
  fitZoom,
  isCardFloored,
  surfacePadding,
  worldFitsViewport,
  zoomAroundPointer,
} from './atlas-camera.ts'

/** The zelda-like overworld: 176x148 tiles at 2 atlas px per tile. */
const overworld: SceneRect = { x: 20, y: 20, w: 352, h: 296 }

/** A single 11x11 room — small enough to hit the minimum card size. */
const room: SceneRect = { x: 380, y: 20, w: 22, h: 22 }

export default async () => {
  await describe('atlas-camera', async () => {
    await describe('clampAtlasZoom', async () => {
      await it('passes a zoom inside the range through', async () => {
        expect(clampAtlasZoom(1.5)).toBe(1.5)
      })

      await it('clamps both ends', async () => {
        expect(clampAtlasZoom(0.01)).toBe(ATLAS_ZOOM_MIN)
        expect(clampAtlasZoom(99)).toBe(ATLAS_ZOOM_MAX)
      })

      await it('keeps the bounds themselves', async () => {
        expect(clampAtlasZoom(ATLAS_ZOOM_MIN)).toBe(ATLAS_ZOOM_MIN)
        expect(clampAtlasZoom(ATLAS_ZOOM_MAX)).toBe(ATLAS_ZOOM_MAX)
      })

      await it('clamps a zero, negative or non-finite zoom to the minimum', async () => {
        expect(clampAtlasZoom(0)).toBe(ATLAS_ZOOM_MIN)
        expect(clampAtlasZoom(-3)).toBe(ATLAS_ZOOM_MIN)
        expect(clampAtlasZoom(Number.NaN)).toBe(ATLAS_ZOOM_MIN)
      })
    })

    await describe('cardPixelSize', async () => {
      await it('scales a large map by the zoom alone', async () => {
        expect(cardPixelSize(overworld, 1, CARD_MIN_SHORT_SIDE)).toStrictEqual({ w: 352, h: 296 })
        expect(cardPixelSize(overworld, 0.5, CARD_MIN_SHORT_SIDE)).toStrictEqual({ w: 176, h: 148 })
      })

      await it('rounds to whole pixels', async () => {
        expect(cardPixelSize({ w: 22, h: 22 }, 0.37, 1)).toStrictEqual({ w: 8, h: 8 })
      })

      await it('floors a small map at the minimum short side', async () => {
        expect(cardPixelSize(room, 1, CARD_MIN_SHORT_SIDE)).toStrictEqual({ w: 64, h: 64 })
      })

      await it('keeps the aspect ratio when flooring', async () => {
        // 40x20 atlas px at zoom 1: the short side triples to 60, so
        // the long side triples too rather than being letterboxed.
        expect(cardPixelSize({ w: 40, h: 20 }, 1, 60)).toStrictEqual({ w: 120, h: 60 })
      })

      await it('leaves a card exactly on the floor alone', async () => {
        expect(cardPixelSize({ w: 64, h: 128 }, 1, 64)).toStrictEqual({ w: 64, h: 128 })
      })

      await it('is empty for a degenerate map', async () => {
        expect(cardPixelSize({ w: 0, h: 40 }, 1, 64)).toStrictEqual({ w: 0, h: 0 })
        expect(cardPixelSize({ w: 40, h: 40 }, 0, 64)).toStrictEqual({ w: 0, h: 0 })
      })
    })

    await describe('drawnRects', async () => {
      await it('scales positions and sizes by the zoom', async () => {
        expect(drawnRects([overworld], 0.5, CARD_MIN_SHORT_SIDE)).toStrictEqual([{ x: 10, y: 10, w: 176, h: 148 }])
      })

      await it('offsets every card by the surface origin', async () => {
        expect(drawnRects([overworld], 1, CARD_MIN_SHORT_SIDE, { x: 100, y: 40 })).toStrictEqual([
          { x: 120, y: 60, w: 352, h: 296 },
        ])
      })

      await it('anchors a floored card at its top-left corner', async () => {
        // The room grows right and down from its own position, so it
        // never reaches back past the surface origin.
        expect(drawnRects([room], 0.5, CARD_MIN_SHORT_SIDE)).toStrictEqual([{ x: 190, y: 10, w: 64, h: 64 }])
      })

      await it('preserves scene order', async () => {
        expect(drawnRects([room, overworld], 1, CARD_MIN_SHORT_SIDE).map((r) => r.x)).toStrictEqual([380, 20])
      })

      await it('is empty for an empty world', async () => {
        expect(drawnRects([], 1, CARD_MIN_SHORT_SIDE)).toStrictEqual([])
      })
    })

    await describe('drawnExtent', async () => {
      await it('measures the drawn world including the minimum card size', async () => {
        // The room would end at 201 px scaled, but its floored 64 px
        // body pushes the drawn world out to 254.
        expect(drawnExtent([overworld, room], 0.5, CARD_MIN_SHORT_SIDE)).toStrictEqual({ width: 254, height: 158 })
      })

      await it('is the plain scaled extent when nothing hits the floor', async () => {
        expect(drawnExtent([overworld], 1, CARD_MIN_SHORT_SIDE)).toStrictEqual({ width: 372, height: 316 })
      })
    })

    await describe('worldFitsViewport', async () => {
      // Surface coords, i.e. already offset by the surface padding —
      // the bounding box spans 500 x 300 from (200, 100).
      const spread: SceneRect[] = [
        { x: 200, y: 100, w: 300, h: 200 },
        { x: 600, y: 180, w: 100, h: 220 },
      ]

      await it('measures the cards, not their distance from the origin', async () => {
        // Naively measuring to the origin would make this 700 x 400 and
        // report "does not fit" — the padding alone would decide it.
        expect(worldFitsViewport(spread, { w: 520, h: 320 })).toBe(true)
      })

      await it('does not fit when the bounding box is wider than the viewport', async () => {
        expect(worldFitsViewport(spread, { w: 480, h: 320 })).toBe(false)
      })

      await it('does not fit when the bounding box is taller than the viewport', async () => {
        expect(worldFitsViewport(spread, { w: 520, h: 280 })).toBe(false)
      })

      await it('fits exactly at the viewport size', async () => {
        expect(worldFitsViewport(spread, { w: 500, h: 300 })).toBe(true)
      })

      await it('ignores cards with no drawn size', async () => {
        expect(worldFitsViewport([...spread, { x: 0, y: 0, w: 0, h: 0 }], { w: 520, h: 320 })).toBe(true)
      })

      await it('counts an empty world as fitting', async () => {
        expect(worldFitsViewport([], { w: 10, h: 10 })).toBe(true)
      })
    })

    await describe('fitZoom', async () => {
      await it('fits a single map into the viewport', async () => {
        // Extent 372x316 atlas px, 800x600 viewport minus 2x24 margin.
        const zoom = fitZoom({ w: 800, h: 600 }, [overworld], 24, CARD_MIN_SHORT_SIDE)
        const drawn = drawnExtent([overworld], zoom, CARD_MIN_SHORT_SIDE)
        expect(drawn.width <= 752).toBe(true)
        expect(drawn.height <= 552).toBe(true)
        expect(zoom > 1.7).toBe(true)
      })

      await it('leaves room for a floored small map', async () => {
        const rects = [overworld, room]
        const zoom = fitZoom({ w: 400, h: 400 }, rects, 12, CARD_MIN_SHORT_SIDE)
        const drawn = drawnExtent(rects, zoom, CARD_MIN_SHORT_SIDE)
        expect(drawn.width <= 376).toBe(true)
        expect(drawn.height <= 376).toBe(true)
      })

      await it('never exceeds the zoom range', async () => {
        expect(fitZoom({ w: 8000, h: 8000 }, [overworld], 0, CARD_MIN_SHORT_SIDE)).toBe(ATLAS_ZOOM_MAX)
        expect(fitZoom({ w: 100, h: 100 }, [{ x: 0, y: 0, w: 40000, h: 40000 }], 0, CARD_MIN_SHORT_SIDE)).toBe(
          ATLAS_ZOOM_MIN,
        )
      })

      await it('falls back to 100 % for an empty world', async () => {
        expect(fitZoom({ w: 800, h: 600 }, [], 24, CARD_MIN_SHORT_SIDE)).toBe(1)
      })

      await it('survives a viewport smaller than its own margins', async () => {
        // Pre-allocation / tiny window: the available size floors at 1
        // instead of going negative and inverting the fit.
        expect(fitZoom({ w: 10, h: 10 }, [overworld], 24, CARD_MIN_SHORT_SIDE)).toBe(ATLAS_ZOOM_MIN)
      })
    })

    await describe('zoomAroundPointer', async () => {
      await it('keeps the surface point under the pointer', async () => {
        // Surface x 300 sits 100 px into the viewport at zoom 1; at
        // zoom 2 it is at 600, so the scroll offset has to be 500.
        expect(zoomAroundPointer(200, 100, 1, 2)).toBe(500)
      })

      await it('is a no-op for an unchanged zoom', async () => {
        expect(zoomAroundPointer(200, 100, 2, 2)).toBe(200)
      })

      await it('never returns a negative offset', async () => {
        expect(zoomAroundPointer(20, 100, 2, 0.5)).toBe(0)
      })

      await it('zooms around the viewport origin when the pointer is there', async () => {
        expect(zoomAroundPointer(400, 0, 1, 0.5)).toBe(200)
      })

      await it('leaves the offset alone for a zero old zoom', async () => {
        expect(zoomAroundPointer(400, 50, 0, 1)).toBe(400)
      })
    })

    await describe('surfacePadding', async () => {
      await it('centres a world smaller than the viewport', async () => {
        expect(surfacePadding(400, 1000, 24)).toBe(300)
      })

      await it('keeps the minimum padding for a larger world', async () => {
        expect(surfacePadding(4000, 1000, 24)).toBe(24)
      })

      await it('rounds a half pixel', async () => {
        expect(surfacePadding(401, 1000, 24)).toBe(300)
      })

      await it('never goes below the minimum', async () => {
        expect(surfacePadding(1000, 1000, 24)).toBe(24)
      })
    })

    await describe('centeredScroll', async () => {
      await it('centres a span in the viewport', async () => {
        expect(centeredScroll(400, 200, 2000, 500)).toBe(250)
      })

      await it('clamps to the start', async () => {
        expect(centeredScroll(0, 100, 2000, 500)).toBe(0)
      })

      await it('clamps to the end of the adjustment', async () => {
        expect(centeredScroll(1900, 100, 2000, 500)).toBe(1500)
      })

      await it('stays at 0 when the page is larger than the adjustment', async () => {
        expect(centeredScroll(400, 200, 300, 500)).toBe(0)
      })

      await it('stays at 0 before the first allocation', async () => {
        expect(centeredScroll(400, 200, 0, 0)).toBe(0)
      })
    })

    await describe('isCardFloored', async () => {
      await it('reports a card the floor had to enlarge', async () => {
        expect(isCardFloored({ w: 40, h: 30 }, 0.5, CARD_MIN_SHORT_SIDE)).toBe(true)
      })

      await it('leaves a card at its true scale unflagged', async () => {
        expect(isCardFloored({ w: 352, h: 296 }, 1, CARD_MIN_SHORT_SIDE)).toBe(false)
      })

      await it('measures the SHORT side, not the area', async () => {
        // A long thin corridor is floored even though it is wide.
        expect(isCardFloored({ w: 600, h: 20 }, 1, CARD_MIN_SHORT_SIDE)).toBe(true)
      })

      await it('is not floored exactly at the minimum', async () => {
        expect(isCardFloored({ w: CARD_MIN_SHORT_SIDE, h: CARD_MIN_SHORT_SIDE }, 1, CARD_MIN_SHORT_SIDE)).toBe(false)
      })

      await it('follows the zoom', async () => {
        const world = { w: 352, h: 296 }
        expect(isCardFloored(world, 1, CARD_MIN_SHORT_SIDE)).toBe(false)
        expect(isCardFloored(world, 0.05, CARD_MIN_SHORT_SIDE)).toBe(true)
      })

      await it('never flags a degenerate map, which is drawn as nothing', async () => {
        expect(isCardFloored({ w: 0, h: 100 }, 1, CARD_MIN_SHORT_SIDE)).toBe(false)
        expect(isCardFloored({ w: 100, h: 0 }, 1, CARD_MIN_SHORT_SIDE)).toBe(false)
      })
    })
  })
}
