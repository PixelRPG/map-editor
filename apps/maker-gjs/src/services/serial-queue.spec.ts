/**
 * {@link SerialQueue} — the primitive that keeps engine bring-up from
 * running twice over the same state.
 *
 * The property under test is "no two tasks are ever in flight at once",
 * because the defect it was written for is invisible without it: two
 * `ensureForMap` calls interleaving both read the same empty cache, both
 * start a project load, and two `excalibur.start()` calls on one engine
 * deadlock with nothing thrown.
 */

import { describe, expect, it } from '@gjsify/unit'

import { SerialQueue } from './serial-queue.ts'

/** A task that resolves only when its returned `release` is called. */
function gate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

export default async function () {
  await describe('SerialQueue.run', async () => {
    await it('never lets two tasks overlap', async () => {
      const queue = new SerialQueue()
      const first = gate()
      let inFlight = 0
      let maxInFlight = 0
      const track = async (wait?: Promise<void>) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        if (wait) await wait
        inFlight -= 1
      }

      const a = queue.run(() => track(first.opened))
      const b = queue.run(() => track())
      first.release()
      await Promise.all([a, b])

      expect(maxInFlight).toBe(1)
    })

    await it('runs tasks in submission order', async () => {
      const queue = new SerialQueue()
      const order: string[] = []
      const first = gate()

      const a = queue.run(async () => {
        await first.opened
        order.push('a')
      })
      const b = queue.run(async () => void order.push('b'))
      first.release()
      await Promise.all([a, b])

      expect(order.join(',')).toBe('a,b')
    })

    await it('keeps running after a task rejects, and gives the rejection to its own caller', async () => {
      const queue = new SerialQueue()
      const order: string[] = []

      let caught: unknown = null
      const failing = queue.run(async () => {
        order.push('failing')
        throw new Error('load failed')
      })
      const after = queue.run(async () => void order.push('after'))
      await failing.catch((error) => {
        caught = error
      })
      await after

      // A failed bring-up must not strand every later one — the user's
      // next click has to work.
      expect(order.join(',')).toBe('failing,after')
      expect(caught instanceof Error).toBe(true)
    })

    await it('returns the task result, not the queue state', async () => {
      const queue = new SerialQueue()
      expect(await queue.run(async () => 'kokiri-forest')).toBe('kokiri-forest')
    })
  })
}
