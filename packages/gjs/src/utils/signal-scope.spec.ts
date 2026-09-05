import type GObject from '@girs/gobject-2.0'
import { describe, expect, it } from '@gjsify/unit'

import { SignalScope } from './signal-scope.ts'

/**
 * Minimal stand-in for a `GObject.Object` emitter: hands out handler ids,
 * records which are still connected, and refuses a double disconnect the
 * way GLib does (it warns and the id is gone either way — a scope that
 * disconnects twice is a bug even though GTK survives it).
 */
class FakeEmitter {
  private _next = 1
  readonly handlers = new Map<number, { signal: string; fn: (...args: unknown[]) => unknown }>()
  /** Ids disconnected twice — must stay empty. */
  readonly doubleDisconnects: number[] = []

  connect(signal: string, fn: (...args: unknown[]) => unknown): number {
    const id = this._next++
    this.handlers.set(id, { signal, fn })
    return id
  }

  disconnect(id: number): void {
    if (!this.handlers.delete(id)) this.doubleDisconnects.push(id)
  }

  emit(signal: string, ...args: unknown[]): void {
    // Copy: a handler may disconnect itself mid-emission.
    for (const [, handler] of [...this.handlers]) {
      if (handler.signal === signal) handler.fn(...args)
    }
  }

  get connectedCount(): number {
    return this.handlers.size
  }

  /** The scope only ever sees a `GObject.Object`. */
  asSource(): GObject.Object {
    return this as unknown as GObject.Object
  }
}

export default async () => {
  await describe('SignalScope', async () => {
    await describe('connect / disconnectAll', async () => {
      await it('releases every tracked handler', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        scope.connect(emitter.asSource(), 'a', () => {})
        scope.connect(emitter.asSource(), 'b', () => {})
        expect(emitter.connectedCount).toBe(2)
        scope.disconnectAll()
        expect(emitter.connectedCount).toBe(0)
      })

      await it('is idempotent — a second teardown disconnects nothing twice', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        scope.connect(emitter.asSource(), 'a', () => {})
        scope.disconnectAll()
        scope.disconnectAll()
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('can be re-armed after teardown (the map / unmap / map cycle)', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        let calls = 0
        scope.connect(emitter.asSource(), 'a', () => {
          calls++
        })
        scope.disconnectAll()
        emitter.emit('a')
        expect(calls).toBe(0)
        scope.connect(emitter.asSource(), 'a', () => {
          calls++
        })
        emitter.emit('a')
        expect(calls).toBe(1)
      })

      await it('tolerates a scope that never connected anything', async () => {
        const scope = new SignalScope()
        scope.disconnectAll()
        expect(true).toBe(true)
      })
    })

    // The regression guard for `AtlasCanvas.fitToContent()`, which used
    // a hand-rolled `const id = h.connect(…, () => h.disconnect(id))`.
    await describe('connectUntil', async () => {
      await it('keeps listening while the condition is unmet', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        let attempts = 0
        scope.connectUntil(emitter.asSource(), 'notify::page-size', () => {
          attempts++
          return attempts >= 3
        })
        emitter.emit('notify::page-size')
        expect(emitter.connectedCount).toBe(1)
        emitter.emit('notify::page-size')
        expect(emitter.connectedCount).toBe(1)
        emitter.emit('notify::page-size')
        expect(attempts).toBe(3)
        expect(emitter.connectedCount).toBe(0)
      })

      await it('stops running once satisfied', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        let runs = 0
        scope.connectUntil(emitter.asSource(), 'ready', () => {
          runs++
          return true
        })
        emitter.emit('ready')
        emitter.emit('ready')
        expect(runs).toBe(1)
      })

      await it('releases a handler whose condition NEVER arrives', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        scope.connectUntil(emitter.asSource(), 'notify::page-size', () => false)
        // The widget goes away before the first allocation — the leak
        // the hand-rolled shape had, because its only release path ran
        // inside the handler.
        scope.disconnectAll()
        expect(emitter.connectedCount).toBe(0)
      })

      await it('does not double-disconnect an already-satisfied handler', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        scope.connectUntil(emitter.asSource(), 'ready', () => true)
        emitter.emit('ready')
        scope.disconnectAll()
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('leaves sibling bindings connected when one self-disconnects', async () => {
        const emitter = new FakeEmitter()
        const scope = new SignalScope()
        scope.connect(emitter.asSource(), 'other', () => {})
        scope.connectUntil(emitter.asSource(), 'ready', () => true)
        scope.connect(emitter.asSource(), 'another', () => {})
        emitter.emit('ready')
        expect(emitter.connectedCount).toBe(2)
        scope.disconnectAll()
        expect(emitter.connectedCount).toBe(0)
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('supersedes a pending one-shot on re-arm (fitToContent called twice)', async () => {
        const emitter = new FakeEmitter()
        const pending = new SignalScope()
        let applied = 0
        const arm = () => {
          pending.disconnectAll()
          pending.connectUntil(emitter.asSource(), 'notify::page-size', () => {
            applied++
            return true
          })
        }
        arm()
        arm()
        arm()
        // Three requests, ONE handler on the adjustment.
        expect(emitter.connectedCount).toBe(1)
        emitter.emit('notify::page-size')
        expect(applied).toBe(1)
        expect(emitter.connectedCount).toBe(0)
      })
    })
  })
}
