import { describe, expect, it } from '@gjsify/unit'
import { DEFAULT_ASSISTANT_INFO } from '@pixelrpg/engine'

import { AssistantStateService } from './assistant-state.service.ts'

export default async () => {
  await describe('AssistantStateService', async () => {
    await it('starts absent + unpaused with the shared engine default identity', async () => {
      const svc = new AssistantStateService()
      expect(svc.snapshot()).toStrictEqual({
        present: false,
        name: DEFAULT_ASSISTANT_INFO.displayName,
        color: DEFAULT_ASSISTANT_INFO.color,
        paused: false,
      })
    })

    await it('setPresent / setPaused report whether the value actually changed', async () => {
      const svc = new AssistantStateService()
      expect(svc.setPresent(true)).toBe(true)
      expect(svc.setPresent(true)).toBe(false)
      expect(svc.setPaused(true)).toBe(true)
      expect(svc.setPaused(true)).toBe(false)
      expect(svc.setPaused(false)).toBe(true)
    })

    await it('keeps identity across presence flips (hide does not reset name/colour)', async () => {
      const svc = new AssistantStateService()
      svc.setInfo('Claude', '#3584e4')
      svc.setPresent(true)
      svc.setPresent(false)
      expect(svc.name).toBe('Claude')
      expect(svc.color).toBe('#3584e4')
    })

    await it('keeps pause across presence flips — hiding the assistant does not unpause it', async () => {
      const svc = new AssistantStateService()
      svc.setPaused(true)
      svc.setPresent(true)
      svc.setPresent(false)
      expect(svc.paused).toBe(true)
    })

    await it('snapshots are detached copies, not live views', async () => {
      const svc = new AssistantStateService()
      const before = svc.snapshot()
      svc.setPaused(true)
      expect(before.paused).toBe(false)
      expect(svc.snapshot().paused).toBe(true)
    })
  })
}
