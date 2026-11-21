import { describe, expect, it } from '@gjsify/unit'

import { CoachMarksService } from './coach-marks.service.ts'

export default async () => {
  await describe('CoachMarksService (no schema)', async () => {
    await it('starts with nothing seen', async () => {
      expect(new CoachMarksService().isSeen('paint')).toBe(false)
    })

    await it('remembers a step once shown, and only that step', async () => {
      const service = new CoachMarksService()
      service.markSeen('paint')
      expect(service.isSeen('paint')).toBe(true)
      expect(service.isSeen('play')).toBe(false)
    })

    await it('"Show tips again" forgets everything', async () => {
      const service = new CoachMarksService()
      service.markSeen('paint')
      service.markSeen('play')
      service.reset()
      expect(service.isSeen('paint')).toBe(false)
      expect(service.isSeen('play')).toBe(false)
    })
  })
}
