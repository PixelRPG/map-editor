import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

import { delay } from '../main-loop.ts'

const DBUS_IFACE = 'org.freedesktop.DBus'
const DBUS_PATH = '/org/freedesktop/DBus'

/** The session bus every editor instance is dialled on. */
export const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null)

/** Address + payload of one D-Bus method call. */
export interface BusCall {
  busName: string
  objectPath: string
  iface: string
  method: string
  params: GLib.Variant | null
  /** Expected reply signature, e.g. `(s)`. `null` for methods that answer nothing. */
  replyType: string | null
}

/** Async `Gio.DBusConnection.call`; resolves with the reply variant, rejects with the D-Bus error. */
export function callBus(call: BusCall): Promise<GLib.Variant> {
  return new Promise((res, rej) => {
    bus.call(
      call.busName,
      call.objectPath,
      call.iface,
      call.method,
      call.params,
      call.replyType ? GLib.VariantType.new(call.replyType) : null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (conn, r) => {
        try {
          res((conn as Gio.DBusConnection).call_finish(r))
        } catch (error) {
          rej(error)
        }
      },
    )
  })
}

/** Is `busName` currently owned? A failed query answers `false` — the caller only ever asks "is it up". */
export async function nameHasOwner(busName: string): Promise<boolean> {
  try {
    const reply = await callBus({
      busName: DBUS_IFACE,
      objectPath: DBUS_PATH,
      iface: DBUS_IFACE,
      method: 'NameHasOwner',
      params: GLib.Variant.new_tuple([GLib.Variant.new_string(busName)]),
      replyType: '(b)',
    })
    return (reply.recursiveUnpack() as unknown[])[0] as boolean
  } catch {
    return false
  }
}

/** Every name on the session bus. A failed query answers an empty list. */
export async function listNames(): Promise<string[]> {
  try {
    const reply = await callBus({
      busName: DBUS_IFACE,
      objectPath: DBUS_PATH,
      iface: DBUS_IFACE,
      method: 'ListNames',
      params: null,
      replyType: '(as)',
    })
    return (reply.recursiveUnpack() as unknown[])[0] as string[]
  } catch {
    return []
  }
}

/** Poll until `busName` is owned (instance ready) or `timeoutMs` elapses. */
export async function waitForName(busName: string, timeoutMs = 30000): Promise<boolean> {
  const deadline = GLib.get_monotonic_time() + timeoutMs * 1000
  for (;;) {
    if (await nameHasOwner(busName)) return true
    if (GLib.get_monotonic_time() >= deadline) return false
    await delay(200)
  }
}
