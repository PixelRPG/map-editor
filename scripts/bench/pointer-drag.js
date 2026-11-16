// A pointer drag for the frame benchmark, through mutter's RemoteDesktop API on the
// private session bus `headless-run` sets up.
//
//   gjs -m scripts/bench/pointer-drag.js <steps> <dx> <dy> <delayMs>
//
// Press the left button, issue `steps` RELATIVE motions of (dx, dy) with `delayMs`
// between them, release. Relative motion only — unlike `scripts/lib/headless-input.js`
// this needs no screencast stream, because it never maps a monitor coordinate: a pan
// only cares about deltas, and the pointer starts where the compositor left it (the
// centre of the virtual monitor), which is inside the editor canvas.
//
// Why a drag and not `SetZoom`: the D-Bus methods reach the engine directly and skip
// the pointer stream, so they cannot measure what a one-finger pan costs.
// `CameraControlSystem` consumes a pointer-move per frame and writes `camera.pos`,
// and that per-event work is part of the frame budget being attributed.
//
// NEVER pace this with a `while (monotonic < deadline)` spin, which is what
// `headless-input.js` does and what the first version of this file did. A spin pegs a
// core, and under `mutter --headless` it also starves the compositor's frame
// callbacks that drive the GLArea's frame clock — the app under measurement then
// renders ~1 frame per second of dragging and the benchmark reports a stall that only
// the benchmark caused. Measured: 60 motions produced 1 sampled frame spinning,
// ~14 on this main loop.
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'

const RD = 'org.gnome.Mutter.RemoteDesktop'
const BTN_LEFT = 0x110

const [stepsArg, dxArg, dyArg, delayArg] = ARGV
const steps = Number.parseInt(stepsArg ?? '60', 10)
const dx = Number.parseFloat(dxArg ?? '-8')
const dy = Number.parseFloat(dyArg ?? '-4')
const delayMs = Number.parseInt(delayArg ?? '16', 10)

const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null)
// `reply_type` is a GVariantType, not a signature string: gjs throws
// "Expected an object of type GVariantType" on a string and the helper dies
// in ~100 ms, before a single motion is sent.
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

// The whole drag as a queue of timed steps, walked by one timeout source. A real main
// loop between steps is what keeps this process idle while the app renders.
const script = []
// One motion before the press: the window under the pointer does not see it until a
// relative motion arrives (measured with mutter 50 --headless), and a press the widget
// never received is a drag nothing reacts to.
script.push([150, () => notify('NotifyPointerMotionRelative', '(dd)', [1, 0])])
script.push([delayMs, () => notify('NotifyPointerButton', '(ib)', [BTN_LEFT, true])])
for (let i = 0; i < steps; i++) {
  script.push([delayMs, () => notify('NotifyPointerMotionRelative', '(dd)', [dx, dy])])
}
script.push([150, () => notify('NotifyPointerButton', '(ib)', [BTN_LEFT, false])])

let index = 0
const step = () => {
  if (index >= script.length) {
    call(session, `${RD}.Session`, 'Stop', null, null)
    loop.quit()
    return GLib.SOURCE_REMOVE
  }
  const [, action] = script[index++]
  action()
  const next = index < script.length ? script[index][0] : 150
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, next, step)
  return GLib.SOURCE_REMOVE
}

GLib.timeout_add(GLib.PRIORITY_DEFAULT, script[0][0], step)
loop.run()
