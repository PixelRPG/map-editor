/**
 * Cursor-frame rate limiting.
 *
 * Edge-correctness is the property worth pinning: a peer whose last
 * pointer position was swallowed by the throttle window shows a cursor
 * frozen a few pixels off, and nothing ever corrects it because the
 * mouse has stopped moving. Every case below is about that last frame.
 */

import { describe, expect, it } from '@gjsify/unit'

import { CursorThrottle } from './cursor-throttle.ts'

const cursorAt = (x: number) => ({ sceneId: 'town', x, y: 0 })

export default async () => {
  await describe('CursorThrottle', async () => {
    await it('always passes the first offer, whatever the clock reads', async () => {
      expect(new CursorThrottle(30).offer(cursorAt(1), 0)).toStrictEqual(cursorAt(1))
      expect(new CursorThrottle(30).offer(cursorAt(1), 1_700_000_000_000)).toStrictEqual(cursorAt(1))
    })

    await it('coalesces offers inside the window', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      expect(throttle.offer(cursorAt(2), 110)).toBe(null)
      expect(throttle.offer(cursorAt(3), 129)).toBe(null)
    })

    await it('passes an offer exactly at the window boundary', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      expect(throttle.offer(cursorAt(2), 130)).toStrictEqual(cursorAt(2))
    })

    await it('sends the newest position past the window, dropping the stale coalesced one', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      throttle.offer(cursorAt(2), 110)
      expect(throttle.offer(cursorAt(3), 140)).toStrictEqual(cursorAt(3))
      // The superseded value must not resurface on a later flush.
      expect(throttle.flush(200)).toBe(null)
    })

    await it('flushes the coalesced position once its window elapses', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      throttle.offer(cursorAt(2), 110)
      expect(throttle.flush(115)).toBe(null)
      expect(throttle.flush(130)).toStrictEqual(cursorAt(2))
    })

    await it('flushes at most once per coalesced position', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      throttle.offer(cursorAt(2), 110)
      expect(throttle.flush(130)).toStrictEqual(cursorAt(2))
      expect(throttle.flush(200)).toBe(null)
    })

    await it('flushing nothing does not open the window early', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      expect(throttle.flush(105)).toBe(null)
      expect(throttle.offer(cursorAt(2), 120)).toBe(null)
    })

    await it('re-arms the window from the flushed frame, not the coalesced offer', async () => {
      const throttle = new CursorThrottle(30)
      throttle.offer(cursorAt(1), 100)
      throttle.offer(cursorAt(2), 110)
      throttle.flush(130)
      expect(throttle.offer(cursorAt(3), 150)).toBe(null)
      expect(throttle.offer(cursorAt(4), 160)).toStrictEqual(cursorAt(4))
    })

    await it('never throttles with a zero-length window', async () => {
      const throttle = new CursorThrottle(0)
      expect(throttle.offer(cursorAt(1), 100)).toStrictEqual(cursorAt(1))
      expect(throttle.offer(cursorAt(2), 100)).toStrictEqual(cursorAt(2))
    })
  })
}
