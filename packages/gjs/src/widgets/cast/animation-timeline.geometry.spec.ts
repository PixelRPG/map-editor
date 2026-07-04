import { describe, expect, it } from '@gjsify/unit'

import {
  frameAtTime,
  frameSpans,
  frameStartTime,
  timeForX,
  totalDuration,
  xForTime,
} from './animation-timeline.geometry.ts'

export default async () => {
  await describe('animation-timeline.geometry', async () => {
    await describe('totalDuration', async () => {
      await it('sums the frame durations', async () => {
        expect(totalDuration([200, 300, 100])).toBe(600)
      })
      await it('floors at 1 for an empty sequence (safe divisor)', async () => {
        expect(totalDuration([])).toBe(1)
      })
      await it('treats negative durations as zero', async () => {
        expect(totalDuration([200, -50, 100])).toBe(300)
      })
    })

    await describe('frameSpans', async () => {
      await it('produces contiguous half-open spans', async () => {
        expect(frameSpans([200, 300, 100])).toStrictEqual([
          { index: 0, start: 0, end: 200, duration: 200 },
          { index: 1, start: 200, end: 500, duration: 300 },
          { index: 2, start: 500, end: 600, duration: 100 },
        ])
      })
      await it('is empty for no frames', async () => {
        expect(frameSpans([])).toStrictEqual([])
      })
    })

    await describe('frameAtTime', async () => {
      await it('returns -1 for an empty sequence', async () => {
        expect(frameAtTime([], 100)).toBe(-1)
      })
      await it('picks the frame whose span contains t (start-inclusive)', async () => {
        const d = [200, 300, 100]
        expect(frameAtTime(d, 0)).toBe(0)
        expect(frameAtTime(d, 199)).toBe(0)
        expect(frameAtTime(d, 200)).toBe(1) // boundary belongs to the next frame
        expect(frameAtTime(d, 499)).toBe(1)
        expect(frameAtTime(d, 500)).toBe(2)
      })
      await it('clamps out-of-range times to the end frame / first frame', async () => {
        const d = [200, 300, 100]
        expect(frameAtTime(d, 10_000)).toBe(2)
        expect(frameAtTime(d, -50)).toBe(0)
      })
    })

    await describe('frameStartTime', async () => {
      await it('accumulates earlier durations', async () => {
        const d = [200, 300, 100]
        expect(frameStartTime(d, 0)).toBe(0)
        expect(frameStartTime(d, 1)).toBe(200)
        expect(frameStartTime(d, 2)).toBe(500)
      })
      await it('clamps an over-range index to the total', async () => {
        expect(frameStartTime([200, 300], 9)).toBe(500)
      })
    })

    await describe('xForTime / timeForX round-trip', async () => {
      await it('maps time linearly across the width', async () => {
        const d = [200, 200] // total 400
        expect(xForTime(0, d, 400)).toBe(0)
        expect(xForTime(200, d, 400)).toBe(200)
        expect(xForTime(400, d, 400)).toBe(400)
      })
      await it('inverts back to the same time', async () => {
        const d = [150, 250, 100] // total 500
        expect(timeForX(xForTime(300, d, 500), d, 500)).toBe(300)
      })
      await it('clamps x outside the track to the sequence bounds', async () => {
        const d = [200, 200]
        expect(timeForX(-10, d, 400)).toBe(0)
        expect(timeForX(1000, d, 400)).toBe(400)
      })
      await it('returns 0 for a zero-width track', async () => {
        expect(timeForX(50, [200], 0)).toBe(0)
      })
    })
  })
}
