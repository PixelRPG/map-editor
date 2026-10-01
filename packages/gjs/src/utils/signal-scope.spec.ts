import GObject from '@girs/gobject-2.0'
import { describe, expect, it } from '@gjsify/unit'

import { SignalScope } from './signal-scope.ts'

/**
 * A real `GObject.Object` carrying the signals the scope connects in
 * these tests.
 *
 * This started as a hand-written fake with a `connect`/`disconnect` pair,
 * and the fake was the point: no GTK, no display, pure bookkeeping. That
 * stopped being true when {@link SignalScope} moved from `obj.connect(name)`
 * to `GObject.signal_connect(obj, name)`. That is the entry point the
 * dynamic-name case must use — the typed `connect` cannot take a name
 * that arrives as data — and it dispatches straight to the C function, so
 * a JS object with a method of the same name is no longer on the path the
 * scope takes. The fake kept passing while testing nothing: under GJS all
 * nine cases fail with "GObject_Object.prototype.connect called on
 * incompatible Object".
 *
 * A registered GObject is not slower to set up and is honest about what is
 * being measured — handler ids, `disconnect` of a stale id, and emission
 * all come from GLib, which is where the scope's bugs would live.
 *
 * It also puts the suite on the GJS-only entry. `@girs/gobject-2.0`'s
 * runtime module IS `gi://GObject`, so a value import of it cannot load
 * under Node at all — the same reason `test.mts` admits only GTK-free
 * modules, one step earlier in the dependency chain.
 */
const TestEmitter = GObject.registerClass(
  {
    GTypeName: 'PixelRpgTestSignalScopeEmitter',
    Signals: {
      a: {},
      b: {},
      other: {},
      another: {},
      ready: {},
      // Stands in for `Gtk.Adjustment`'s real detail signal. Registered
      // without the `notify::` prefix: that form is a DETAIL on the
      // `notify` signal and carries a pspec argument, so it is not a name
      // this class can declare. The scope only ever passes the name
      // through, so which signal it is does not change what is measured.
      'page-size': {},
    },
  },
  class extends GObject.Object {
    /** Ids disconnected twice — must stay empty. */
    readonly doubleDisconnects: number[] = []

    disconnect(id: number): void {
      // The honest liveness question: a stale id reads false, and GLib only
      // warns on the way out, so a scope that double-disconnects would do it
      // silently and this is where that shows.
      if (!GObject.signal_handler_is_connected(this, id)) this.doubleDisconnects.push(id)
      super.disconnect(id)
    }

    emit(signal: string, ...args: unknown[]): void {
      GObject.signal_emit_by_name(this, signal, ...args)
    }
  },
)

export default async () => {
  await describe('SignalScope', async () => {
    await describe('connect / disconnectAll', async () => {
      await it('releases every tracked handler', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let ran = 0
        scope.connect(emitter, 'a', () => ran++)
        scope.connect(emitter, 'b', () => ran++)
        emitter.emit('a')
        emitter.emit('b')
        expect(ran).toBe(2)
        scope.disconnectAll()
        emitter.emit('a')
        emitter.emit('b')
        expect(ran).toBe(2)
      })

      await it('is idempotent — a second teardown disconnects nothing twice', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        scope.connect(emitter, 'a', () => {})
        scope.disconnectAll()
        scope.disconnectAll()
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('can be re-armed after teardown (the map / unmap / map cycle)', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let calls = 0
        scope.connect(emitter, 'a', () => {
          calls++
        })
        scope.disconnectAll()
        emitter.emit('a')
        expect(calls).toBe(0)
        scope.connect(emitter, 'a', () => {
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
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let attempts = 0
        scope.connectUntil(emitter, 'page-size', () => {
          attempts++
          return attempts >= 3
        })
        emitter.emit('page-size')
        expect(attempts).toBe(1)
        emitter.emit('page-size')
        expect(attempts).toBe(2)
        // Still listening after two misses — the handler is not one-shot yet.
        expect(emitter.doubleDisconnects).toStrictEqual([])
        emitter.emit('page-size')
        expect(attempts).toBe(3)
        // Condition met, so the handler released ITSELF.
        emitter.emit('page-size')
        expect(attempts).toBe(3)
      })

      await it('stops running once satisfied', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let runs = 0
        scope.connectUntil(emitter, 'ready', () => {
          runs++
          return true
        })
        emitter.emit('ready')
        emitter.emit('ready')
        expect(runs).toBe(1)
      })

      await it('releases a handler whose condition NEVER arrives', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let runs = 0
        scope.connectUntil(emitter, 'page-size', () => {
          runs++
          return false
        })
        // The widget goes away before the first allocation — the leak the
        // hand-rolled shape had, because its only release path ran inside
        // the handler.
        scope.disconnectAll()
        emitter.emit('page-size')
        expect(runs).toBe(0)
      })

      await it('does not double-disconnect an already-satisfied binding', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        scope.connectUntil(emitter, 'ready', () => true)
        emitter.emit('ready')
        scope.disconnectAll()
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('leaves sibling bindings connected when one self-disconnects', async () => {
        const emitter = new TestEmitter()
        const scope = new SignalScope()
        let others = 0
        scope.connect(emitter, 'other', () => others++)
        scope.connectUntil(emitter, 'ready', () => true)
        scope.connect(emitter, 'another', () => others++)
        emitter.emit('ready')
        // The one-shot released itself; both siblings are untouched.
        emitter.emit('other')
        emitter.emit('another')
        expect(others).toBe(2)
        scope.disconnectAll()
        emitter.emit('other')
        emitter.emit('another')
        expect(others).toBe(2)
        expect(emitter.doubleDisconnects).toStrictEqual([])
      })

      await it('supersedes a pending one-shot on re-arm (fitToContent called twice)', async () => {
        const emitter = new TestEmitter()
        const pending = new SignalScope()
        let applied = 0
        const arm = () => {
          pending.disconnectAll()
          pending.connectUntil(emitter, 'page-size', () => {
            applied++
            return true
          })
        }
        arm()
        arm()
        arm()
        // Three requests, ONE handler on the adjustment: one emission, one
        // application. A scope that leaked the earlier two would answer 2
        // and 3 here.
        emitter.emit('page-size')
        expect(applied).toBe(1)
        emitter.emit('page-size')
        expect(applied).toBe(1)
      })
    })
  })
}
