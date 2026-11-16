// Hold one key down for a while, through mutter's RemoteDesktop API on the private
// session bus `headless-run` sets up.
//
//   gjs -m scripts/bench/hold-key.js <keysym> <holdMs>
//
// `scripts/lib/headless-input.js` only taps a key (press + release back to back),
// which makes the hero take one step. A Live Run measurement needs him WALKING for
// the whole sample window: a standing hero measures the idle path again, and the walk
// is what adds the actor update, the follow camera and the collision queries to the
// frame.
//
// Paced by a GLib main loop, never a monotonic-time spin — see the note in
// `pointer-drag.js`: a spin starves the compositor's frame callbacks and the app under
// measurement stops rendering, which the benchmark would then report as a stall.
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'

const RD = 'org.gnome.Mutter.RemoteDesktop'

const [symArg = '0xff53', holdArg] = ARGV
// Accept both spellings: `0xff53` as a keysym table is written, and the plain
// decimal a caller gets from `int()`. A fixed radix silently misreads one of them
// (parseInt('65363', 16) is 0x65363 — a keysym nothing is bound to, so the hero
// would just stand there and the run scenario would measure idle).
const sym = /^0x/i.test(symArg) ? Number.parseInt(symArg.slice(2), 16) : Number.parseInt(symArg, 10)
const holdMs = Number.parseInt(holdArg ?? '5000', 10)

const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null)
// `reply_type` is a GVariantType, not a signature string — see pointer-drag.js.
const call = (path, iface, method, params, type = null) =>
  bus.call_sync(
    RD,
    path,
    iface,
    method,
    params,
    type === null ? null : new GLib.VariantType(type),
    Gio.DBusCallFlags.NONE,
    10000,
    null,
  )

const session = call('/org/gnome/Mutter/RemoteDesktop', RD, 'CreateSession', null, '(o)').deepUnpack()[0]
call(session, `${RD}.Session`, 'Start', null, null)
const notify = (method, signature, values) =>
  call(session, `${RD}.Session`, method, new GLib.Variant(signature, values), null)

const loop = new GLib.MainLoop(null, false)

notify('NotifyKeyboardKeysym', '(ub)', [sym, true])
GLib.timeout_add(GLib.PRIORITY_DEFAULT, holdMs, () => {
  notify('NotifyKeyboardKeysym', '(ub)', [sym, false])
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
    call(session, `${RD}.Session`, 'Stop', null, null)
    loop.quit()
    return GLib.SOURCE_REMOVE
  })
  return GLib.SOURCE_REMOVE
})
loop.run()
