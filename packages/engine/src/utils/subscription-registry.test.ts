import { describe, expect, it, vi } from 'vitest'
import { SubscriptionRegistry } from './subscription-registry.ts'

describe('SubscriptionRegistry', () => {
  it('primes new subscribers with the latest cached value (null if never set)', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const listener = vi.fn()
    reg.subscribe('a', listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('primes new subscribers with the cached value when one exists', () => {
    const reg = new SubscriptionRegistry<string, number>()
    reg.notify('a', 7)
    const listener = vi.fn()
    reg.subscribe('a', listener)
    expect(listener).toHaveBeenCalledWith(7)
  })

  it('broadcasts on notify to every subscriber for the same key', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const a = vi.fn()
    const b = vi.fn()
    reg.subscribe('x', a)
    reg.subscribe('x', b)
    a.mockClear()
    b.mockClear()
    reg.notify('x', 42)
    expect(a).toHaveBeenCalledWith(42)
    expect(b).toHaveBeenCalledWith(42)
  })

  it('isolates broadcasts by key', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const a = vi.fn()
    const b = vi.fn()
    reg.subscribe('one', a)
    reg.subscribe('two', b)
    a.mockClear()
    b.mockClear()
    reg.notify('one', 1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('supports null as the cleared-value marker', () => {
    const reg = new SubscriptionRegistry<string, number>()
    reg.notify('k', 5)
    const listener = vi.fn()
    reg.subscribe('k', listener)
    listener.mockClear()
    reg.notify('k', null)
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('disconnects via the returned function', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const listener = vi.fn()
    const dispose = reg.subscribe('k', listener)
    listener.mockClear()
    dispose()
    reg.notify('k', 1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('cleans empty buckets so size reflects real subscribers', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const a = vi.fn()
    const dispose = reg.subscribe('k', a)
    expect(reg.size).toBe(1)
    dispose()
    expect(reg.size).toBe(0)
  })

  it('tolerates a listener that disposes itself during its callback', () => {
    const reg = new SubscriptionRegistry<string, number>()
    let dispose: (() => void) | null = null
    const a = vi.fn(() => dispose?.())
    const b = vi.fn()
    dispose = reg.subscribe('k', a)
    reg.subscribe('k', b)
    a.mockClear()
    b.mockClear()
    reg.notify('k', 1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).toHaveBeenCalledWith(1)
  })

  it('peek returns the cached value without subscribing', () => {
    const reg = new SubscriptionRegistry<string, number>()
    expect(reg.peek('k')).toBeNull()
    reg.notify('k', 9)
    expect(reg.peek('k')).toBe(9)
    expect(reg.size).toBe(0)
  })

  it('clear drops listeners + cache; registry remains usable', () => {
    const reg = new SubscriptionRegistry<string, number>()
    const a = vi.fn()
    reg.subscribe('k', a)
    reg.notify('k', 1)
    a.mockClear()
    reg.clear()
    expect(reg.size).toBe(0)
    expect(reg.peek('k')).toBeNull()

    // The original listener is gone — re-notifying isn't broadcast to it.
    reg.notify('k', 2)
    expect(a).not.toHaveBeenCalled()

    // A fresh subscriber after clear+notify sees the most recent value (2),
    // proving the registry rebuilt its cache via the post-clear notify.
    const b = vi.fn()
    reg.subscribe('k', b)
    expect(b).toHaveBeenCalledWith(2)
  })
})
