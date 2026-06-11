import { describe, expect, it, spy } from '@gjsify/unit'

import { SubscriptionRegistry } from './subscription-registry.ts'

export default async () => {
  await describe('SubscriptionRegistry', async () => {
    await it('primes new subscribers with the latest cached value (null if never set)', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const listener = spy((_value: number | null): void => {})
      reg.subscribe('a', listener)
      expect(listener.calls.length).toBe(1)
      expect(listener.lastCall?.arguments[0]).toBeNull()
    })

    await it('primes new subscribers with the cached value when one exists', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      reg.notify('a', 7)
      const listener = spy((_value: number | null): void => {})
      reg.subscribe('a', listener)
      expect(listener.lastCall?.arguments[0]).toBe(7)
    })

    await it('broadcasts on notify to every subscriber for the same key', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const a = spy((_value: number | null): void => {})
      const b = spy((_value: number | null): void => {})
      reg.subscribe('x', a)
      reg.subscribe('x', b)
      a.reset()
      b.reset()
      reg.notify('x', 42)
      expect(a.lastCall?.arguments[0]).toBe(42)
      expect(b.lastCall?.arguments[0]).toBe(42)
    })

    await it('isolates broadcasts by key', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const a = spy((_value: number | null): void => {})
      const b = spy((_value: number | null): void => {})
      reg.subscribe('one', a)
      reg.subscribe('two', b)
      a.reset()
      b.reset()
      reg.notify('one', 1)
      expect(a.lastCall?.arguments[0]).toBe(1)
      expect(b.calls.length).toBe(0)
    })

    await it('supports null as the cleared-value marker', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      reg.notify('k', 5)
      const listener = spy((_value: number | null): void => {})
      reg.subscribe('k', listener)
      listener.reset()
      reg.notify('k', null)
      expect(listener.lastCall?.arguments[0]).toBeNull()
    })

    await it('disconnects via the returned function', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const listener = spy((_value: number | null): void => {})
      const dispose = reg.subscribe('k', listener)
      listener.reset()
      dispose()
      reg.notify('k', 1)
      expect(listener.calls.length).toBe(0)
    })

    await it('cleans empty buckets so size reflects real subscribers', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const a = spy((_value: number | null): void => {})
      const dispose = reg.subscribe('k', a)
      expect(reg.size).toBe(1)
      dispose()
      expect(reg.size).toBe(0)
    })

    await it('tolerates a listener that disposes itself during its callback', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      let dispose: (() => void) | null = null
      const a = spy<(value: number | null) => void>(() => dispose?.())
      const b = spy((_value: number | null): void => {})
      dispose = reg.subscribe('k', a)
      reg.subscribe('k', b)
      a.reset()
      b.reset()
      reg.notify('k', 1)
      expect(a.lastCall?.arguments[0]).toBe(1)
      expect(b.lastCall?.arguments[0]).toBe(1)
    })

    await it('peek returns the cached value without subscribing', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      expect(reg.peek('k')).toBeNull()
      reg.notify('k', 9)
      expect(reg.peek('k')).toBe(9)
      expect(reg.size).toBe(0)
    })

    await it('clear drops listeners + cache; registry remains usable', async () => {
      const reg = new SubscriptionRegistry<string, number>()
      const a = spy((_value: number | null): void => {})
      reg.subscribe('k', a)
      reg.notify('k', 1)
      a.reset()
      reg.clear()
      expect(reg.size).toBe(0)
      expect(reg.peek('k')).toBeNull()

      reg.notify('k', 2)
      expect(a.calls.length).toBe(0)

      const b = spy((_value: number | null): void => {})
      reg.subscribe('k', b)
      expect(b.lastCall?.arguments[0]).toBe(2)
    })
  })
}
