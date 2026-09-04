import { describe, expect, it } from '@gjsify/unit'

import {
  chipWidthForDuration,
  clampFrameDuration,
  clampZoomLevel,
  DEFAULT_ZOOM_LEVEL,
  isAnimationNameValid,
  reservedAnimationNames,
  ZOOM_LEVELS,
  zoomPercent,
} from './add-animation-dialog.model.ts'

const REQUIRED = ['walk-up', 'walk-down'] as const

export default async () => {
  await describe('add-animation-dialog.model', async () => {
    await describe('chipWidthForDuration', async () => {
      await it('renders the reference duration at the base thumb width', async () => {
        expect(chipWidthForDuration(200)).toBe(40)
      })

      await it('scales width with duration', async () => {
        expect(chipWidthForDuration(400)).toBe(80)
      })

      await it('keeps very short frames clickable', async () => {
        expect(chipWidthForDuration(10)).toBe(28)
      })

      await it('stops very long frames from dominating the strip', async () => {
        expect(chipWidthForDuration(5000)).toBe(120)
      })
    })

    await describe('clampFrameDuration', async () => {
      await it('passes an in-range duration through', async () => {
        expect(clampFrameDuration(250)).toBe(250)
      })

      await it('clamps below the floor and above the ceiling', async () => {
        expect(clampFrameDuration(0)).toBe(50)
        expect(clampFrameDuration(9000)).toBe(2000)
      })
    })

    await describe('zoomPercent', async () => {
      await it('reports the default level as 100%', async () => {
        expect(zoomPercent(DEFAULT_ZOOM_LEVEL)).toBe(100)
      })

      await it('reports the smallest level below 100%', async () => {
        expect(zoomPercent(0)).toBe(50)
      })
    })

    await describe('clampZoomLevel', async () => {
      await it('stops at both ends', async () => {
        expect(clampZoomLevel(-1)).toBe(0)
        expect(clampZoomLevel(ZOOM_LEVELS.length)).toBe(ZOOM_LEVELS.length - 1)
      })
    })

    await describe('reservedAnimationNames', async () => {
      await it('reserves the required roles and the existing animations', async () => {
        const reserved = reservedAnimationNames(REQUIRED, [{ id: 'wave' }], null)
        expect(reserved.has('walk-up')).toBe(true)
        expect(reserved.has('wave')).toBe(true)
      })

      await it('lets the edited animation keep its own name', async () => {
        const reserved = reservedAnimationNames(REQUIRED, [{ id: 'wave' }], 'wave')
        expect(reserved.has('wave')).toBe(false)
      })
    })

    await describe('isAnimationNameValid', async () => {
      await it('accepts a fresh name with frames', async () => {
        expect(isAnimationNameValid('dash', new Set(['wave']), 2)).toBe(true)
      })

      await it('rejects an empty name', async () => {
        expect(isAnimationNameValid('', new Set(), 2)).toBe(false)
      })

      await it('rejects a reserved name', async () => {
        expect(isAnimationNameValid('wave', new Set(['wave']), 2)).toBe(false)
      })

      await it('rejects an empty sequence', async () => {
        expect(isAnimationNameValid('dash', new Set(), 0)).toBe(false)
      })
    })
  })
}
