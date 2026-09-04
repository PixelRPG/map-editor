/**
 * The transient-`disconnected` grace window.
 *
 * Two mistakes this guards against: closing a session that would have
 * healed itself, and a flapping connection whose repeated
 * `disconnected` transitions keep re-arming the timer so the window
 * never elapses at all.
 *
 * Every wait below is generous relative to its window — the GJS main
 * loop's timer granularity is coarse enough that a tight margin turns
 * these into flaky tests rather than useful ones.
 */

import { describe, expect, it } from '@gjsify/unit'

import { DisconnectGrace } from './disconnect-grace.ts'

const WINDOW_MS = 20

/** Resolve well after `WINDOW_MS`, so a timer scheduled for it has run. */
function afterWindow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, WINDOW_MS * 3))
}

export default async () => {
  await describe('DisconnectGrace', async () => {
    await it('fires once the window elapses', async () => {
      let fired = 0
      const grace = new DisconnectGrace(WINDOW_MS, () => {
        fired++
      })
      grace.schedule()
      expect(fired).toBe(0)
      await afterWindow()
      expect(fired).toBe(1)
    })

    await it('defers even a zero-length window to a later macrotask', async () => {
      let fired = 0
      const grace = new DisconnectGrace(0, () => {
        fired++
      })
      grace.schedule()
      expect(fired).toBe(0)
      await afterWindow()
      expect(fired).toBe(1)
    })

    await it('does not fire after cancel', async () => {
      let fired = 0
      const grace = new DisconnectGrace(WINDOW_MS, () => {
        fired++
      })
      grace.schedule()
      grace.cancel()
      await afterWindow()
      expect(fired).toBe(0)
    })

    await it('ignores a re-schedule while a window is already open', async () => {
      // A flapping connection re-enters `disconnected` repeatedly; if
      // each transition re-armed the timer the window would never close.
      let fired = 0
      const grace = new DisconnectGrace(WINDOW_MS, () => {
        fired++
      })
      grace.schedule()
      grace.schedule()
      grace.schedule()
      await afterWindow()
      expect(fired).toBe(1)
    })

    await it('can be re-armed after it has fired', async () => {
      let fired = 0
      const grace = new DisconnectGrace(WINDOW_MS, () => {
        fired++
      })
      grace.schedule()
      await afterWindow()
      grace.schedule()
      await afterWindow()
      expect(fired).toBe(2)
    })

    await it('tolerates cancel without a running window', async () => {
      const grace = new DisconnectGrace(WINDOW_MS, () => {
        throw new Error('must not fire')
      })
      grace.cancel()
      grace.cancel()
      await afterWindow()
    })
  })
}
