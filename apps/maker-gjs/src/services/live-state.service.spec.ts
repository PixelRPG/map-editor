import { describe, expect, it } from '@gjsify/unit'

import { type LiveState, LiveStateService } from './live-state.service.ts'

export default async () => {
  await describe('LiveStateService', async () => {
    await it('reads nothing and tells nobody outside a run', async () => {
      let reads = 0
      const svc = new LiveStateService(() => {
        reads++
        return { flags: {}, thingFlags: {} }
      })
      let calls = 0
      svc.onChanged(() => calls++)
      svc.refresh()
      expect(reads).toBe(0)
      expect(calls).toBe(0)
      expect(svc.snapshot).toBe(null)
    })

    await it('reads on start and again on every refresh while running', async () => {
      let coins = 0
      const svc = new LiveStateService(() => ({ flags: { coins }, thingFlags: {} }))
      const seen: (number | null)[] = []
      svc.onChanged((s) => seen.push(s ? (s.flags.coins as number) : null))
      svc.start()
      coins = 3
      svc.refresh()
      expect(seen).toStrictEqual([0, 3])
      expect(svc.active).toBe(true)
    })

    await it('forgets the state when the run stops, and stops reading', async () => {
      let reads = 0
      const svc = new LiveStateService(() => {
        reads++
        return { flags: {}, thingFlags: {} }
      })
      let last: LiveState | null | undefined
      svc.onChanged((s) => {
        last = s
      })
      svc.start()
      svc.stop()
      svc.refresh()
      expect(last).toBe(null)
      expect(reads).toBe(1)
    })

    await it('an unsubscribed listener hears nothing more', async () => {
      const svc = new LiveStateService(() => ({ flags: {}, thingFlags: {} }))
      let calls = 0
      const off = svc.onChanged(() => calls++)
      svc.start()
      off()
      svc.refresh()
      expect(calls).toBe(1)
    })
  })
}
