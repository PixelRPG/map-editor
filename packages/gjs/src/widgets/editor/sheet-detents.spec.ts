/**
 * The sheet's detent arithmetic, without a display.
 *
 * The ordering invariants come first and are asserted across a range of
 * window heights rather than at the one phone size that gets looked at:
 * the clamping that keeps Half ≤ Full only shows up on a short window,
 * which is exactly where nobody tests by hand.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  bottomInsetFor,
  clampSheetHeight,
  cycleDetent,
  detentHeight,
  dragVelocityY,
  nextDetent,
  releaseDetent,
  SHEET_DETENTS,
  SHEET_DRAG_CLAIM_PX,
  SHEET_FLING_VELOCITY,
  SHEET_FULL_GAP_PX,
  SHEET_HALF_MIN_PX,
  type SheetMetrics,
  snapDetent,
} from './sheet-detents.ts'

/** A typical phone: 360 × 800 with the two-row bar docked. */
const PHONE: SheetMetrics = { windowHeight: 800, barHeight: 112 }

/** Window heights from a landscape phone up to a desktop-sized window. */
const HEIGHTS = [320, 400, 560, 640, 800, 1024, 1200]

const everyMetrics = (): SheetMetrics[] => HEIGHTS.map((windowHeight) => ({ windowHeight, barHeight: 112 }))

export default async () => {
  await describe('detentHeight', async () => {
    await it('orders the ladder at every window height', async () => {
      for (const metrics of everyMetrics()) {
        const peek = detentHeight('peek', metrics)
        const half = detentHeight('half', metrics)
        const full = detentHeight('full', metrics)
        expect(peek <= half).toBe(true)
        expect(half <= full).toBe(true)
      }
    })

    await it('makes Peek exactly the docked bar', async () => {
      expect(detentHeight('peek', PHONE)).toBe(112)
      expect(detentHeight('peek', { windowHeight: 800, barHeight: 0 })).toBe(0)
    })

    await it('takes 46 % of the window for Half once that clears the floor', async () => {
      expect(detentHeight('half', PHONE)).toBe(368)
      expect(detentHeight('half', { ...PHONE, windowHeight: 1200 })).toBe(552)
    })

    await it('holds Half at its floor on a small window', async () => {
      // 46 % of 640 is 294 — below the floor, so the palette would have
      // room for a single row of tiles and the switcher.
      expect(detentHeight('half', { ...PHONE, windowHeight: 640 })).toBe(SHEET_HALF_MIN_PX)
    })

    await it('never lets the floor push Half past Full', async () => {
      // Full is 320 − 56 = 264 here, below the 320 px floor. A Half
      // taller than Full would make dragging UP shrink the sheet.
      const tiny: SheetMetrics = { windowHeight: 320, barHeight: 112 }
      expect(detentHeight('full', tiny)).toBe(320 - SHEET_FULL_GAP_PX)
      expect(detentHeight('half', tiny)).toBe(detentHeight('full', tiny))
    })

    await it('never lets Full fall below the bar', async () => {
      const metrics: SheetMetrics = { windowHeight: 100, barHeight: 112 }
      expect(detentHeight('full', metrics)).toBe(112)
      expect(detentHeight('half', metrics)).toBe(112)
    })

    await it('leaves Full a strip of map at the top', async () => {
      expect(detentHeight('full', PHONE)).toBe(800 - SHEET_FULL_GAP_PX)
    })
  })

  await describe('clampSheetHeight', async () => {
    await it('leaves a height between the ends alone', async () => {
      expect(clampSheetHeight(300, PHONE)).toBe(300)
    })

    await it('refuses to drag the sheet shorter than the bar', async () => {
      expect(clampSheetHeight(0, PHONE)).toBe(112)
      expect(clampSheetHeight(-900, PHONE)).toBe(112)
    })

    await it('refuses to drag the sheet past Full', async () => {
      expect(clampSheetHeight(5000, PHONE)).toBe(detentHeight('full', PHONE))
    })

    await it('lands inside the ladder at every window height', async () => {
      for (const metrics of everyMetrics()) {
        for (const height of [-100, 0, 200, 500, 4000]) {
          const clamped = clampSheetHeight(height, metrics)
          expect(clamped >= detentHeight('peek', metrics)).toBe(true)
          expect(clamped <= detentHeight('full', metrics)).toBe(true)
        }
      }
    })
  })

  await describe('dragVelocityY', async () => {
    await it('reads a downward drag as a positive velocity', async () => {
      // 40 px down in 50 ms = 800 px/s, past the fling threshold.
      const velocity = dragVelocityY([
        { offsetY: 0, timeMs: 1000 },
        { offsetY: 40, timeMs: 1050 },
      ])
      expect(velocity).toBe(800)
      expect(velocity >= SHEET_FLING_VELOCITY).toBe(true)
    })

    await it('reads an upward drag as a negative velocity', async () => {
      expect(
        dragVelocityY([
          { offsetY: 0, timeMs: 1000 },
          { offsetY: -40, timeMs: 1050 },
        ]),
      ).toBe(-800)
    })

    await it('measures the flick, not the whole drag', async () => {
      // A finger that wandered for 400 ms and then flicked down: averaged
      // over the drag this is 50 px/s, which would snap instead of fling.
      const velocity = dragVelocityY([
        { offsetY: 0, timeMs: 1000 },
        { offsetY: -5, timeMs: 1400 },
        { offsetY: 25, timeMs: 1450 },
      ])
      expect(velocity).toBe(600)
    })

    await it('reports no movement when there is nothing to measure', async () => {
      expect(dragVelocityY([])).toBe(0)
      expect(dragVelocityY([{ offsetY: 30, timeMs: 1000 }])).toBe(0)
    })

    await it('skips samples that share a timestamp', async () => {
      // Two events in the same millisecond would divide by zero.
      expect(
        dragVelocityY([
          { offsetY: 0, timeMs: 1000 },
          { offsetY: 40, timeMs: 1050 },
          { offsetY: 44, timeMs: 1050 },
        ]),
      ).toBe(880)
    })

    await it('reports no movement when every sample shares a timestamp', async () => {
      expect(
        dragVelocityY([
          { offsetY: 0, timeMs: 1000 },
          { offsetY: 40, timeMs: 1000 },
        ]),
      ).toBe(0)
    })
  })

  await describe('SHEET_DRAG_CLAIM_PX', async () => {
    await it('claims before GTK hands the sequence to the swipe tracker', async () => {
      // GTK's own DRAG_THRESHOLD_DISTANCE is 16 px (gtkgesturedrag.c);
      // the sheet's ancestor swipe tracker claims there, so the grabber
      // has to be decided well before it.
      expect(SHEET_DRAG_CLAIM_PX < 16).toBe(true)
      expect(SHEET_DRAG_CLAIM_PX > 0).toBe(true)
    })
  })

  await describe('nextDetent', async () => {
    await it('steps one rung in the asked direction', async () => {
      expect(nextDetent('peek', 'up')).toBe('half')
      expect(nextDetent('half', 'up')).toBe('full')
      expect(nextDetent('full', 'down')).toBe('half')
      expect(nextDetent('half', 'down')).toBe('peek')
    })

    await it('stays put at the ends of the ladder', async () => {
      expect(nextDetent('full', 'up')).toBe('full')
      expect(nextDetent('peek', 'down')).toBe('peek')
    })
  })

  await describe('cycleDetent', async () => {
    await it('runs Peek → Half → Full → Peek', async () => {
      expect(cycleDetent('peek')).toBe('half')
      expect(cycleDetent('half')).toBe('full')
      expect(cycleDetent('full')).toBe('peek')
    })

    await it('returns to the start after one lap', async () => {
      let detent = SHEET_DETENTS[0]
      for (let i = 0; i < SHEET_DETENTS.length; i++) detent = cycleDetent(detent)
      expect(detent).toBe(SHEET_DETENTS[0])
    })
  })

  await describe('snapDetent', async () => {
    await it('returns a detent its own height snaps back to', async () => {
      for (const metrics of everyMetrics()) {
        for (const detent of SHEET_DETENTS) {
          // Not `toBe(detent)`: on a short window two detents collapse
          // onto the same height, and then either answer is correct.
          const snapped = snapDetent(detentHeight(detent, metrics), metrics)
          expect(detentHeight(snapped, metrics)).toBe(detentHeight(detent, metrics))
        }
      }
    })

    await it('takes the nearer neighbour', async () => {
      expect(snapDetent(150, PHONE)).toBe('peek')
      expect(snapDetent(330, PHONE)).toBe('half')
      expect(snapDetent(600, PHONE)).toBe('full')
    })

    await it('clamps heights beyond either end', async () => {
      expect(snapDetent(-500, PHONE)).toBe('peek')
      expect(snapDetent(5000, PHONE)).toBe('full')
    })
  })

  await describe('releaseDetent', async () => {
    await it('takes the next detent down on a downward fling', async () => {
      // Barely moved, but thrown — the dismiss gesture people make.
      const detent = releaseDetent({
        current: 'full',
        height: detentHeight('full', PHONE),
        velocityY: SHEET_FLING_VELOCITY,
        metrics: PHONE,
      })
      expect(detent).toBe('half')
    })

    await it('takes the next detent up on an upward fling', async () => {
      const detent = releaseDetent({
        current: 'peek',
        height: detentHeight('peek', PHONE),
        velocityY: -SHEET_FLING_VELOCITY,
        metrics: PHONE,
      })
      expect(detent).toBe('half')
    })

    await it('never skips a rung, however hard the fling', async () => {
      const detent = releaseDetent({
        current: 'full',
        height: detentHeight('full', PHONE),
        velocityY: 20_000,
        metrics: PHONE,
      })
      expect(detent).toBe('half')
    })

    await it('snaps to the nearest detent on a slow release', async () => {
      const detent = releaseDetent({ current: 'full', height: 180, velocityY: 10, metrics: PHONE })
      expect(detent).toBe('peek')
    })
  })

  await describe('bottomInsetFor', async () => {
    await it('ducks the camera by the map the sheet covers at Half', async () => {
      expect(bottomInsetFor('half', PHONE)).toBe(368 - 112)
    })

    await it('charges nothing at Peek — the bar already docks the canvas', async () => {
      expect(bottomInsetFor('peek', PHONE)).toBe(0)
    })

    await it('charges nothing at Full — the map behind a modal sheet is dimmed', async () => {
      expect(bottomInsetFor('full', PHONE)).toBe(0)
    })

    await it('never asks for a negative inset', async () => {
      for (const metrics of everyMetrics()) {
        for (const detent of SHEET_DETENTS) expect(bottomInsetFor(detent, metrics) >= 0).toBe(true)
      }
    })
  })
}
