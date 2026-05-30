import '@gjsify/dom-elements/register'
import '@gjsify/webrtc/register'

import GLib from '@girs/glib-2.0'
import system from 'system'

import { Application } from './application.ts'

// Pair-Editing diagnostic flag — gates verbose [peer-session/<role>]
// logs in @pixelrpg/engine's PeerSession (SDP exchange, ICE flow,
// channel + state transitions). Default-on while the v1 hand-test
// flow is still in flight; switch the default to off once the
// WebRTC stack is proven solid. Override via env:
//
//   PIXELRPG_DEBUG_PEER=0  → suppress
//   PIXELRPG_DEBUG_PEER=1  → enable (default)
const debugPeerEnv = GLib.getenv('PIXELRPG_DEBUG_PEER')
if (debugPeerEnv !== '0' && debugPeerEnv !== 'false') {
  ;(globalThis as { __PIXELRPG_PEER_DEBUG?: boolean }).__PIXELRPG_PEER_DEBUG = true
}

// TEMPORARY SHIM — install `globalThis.reportError` so EventTarget's
// listener-exception catch (in @gjsify/dom-events) delegates here
// instead of falling back to `console.error(err)`. The fallback
// path renders Error objects as `{}` via `@gjsify/console`'s
// `_formatArgs` JSON.stringify pass (Error's enumerable property
// set is empty), which is why hand-test logs showed mysterious
// bare `{}` lines with no message + no stack — see PR gjsify#426
// for the root-cause fix in @gjsify/dom-events itself.
//
// Once @gjsify ≥0.4.36 lands and this app bumps its dep, the
// shim becomes redundant (the upstream fix delegates to reportError
// natively when wired) and this block can be deleted.
//
// SpiderMonkey's `Error.stack` is frames-only — no name+message
// embedded at the top — so the formatter always prepends them.
if (typeof (globalThis as { reportError?: unknown }).reportError !== 'function') {
  ;(globalThis as { reportError: (err: unknown) => void }).reportError = (err) => {
    if (err instanceof Error) {
      const head = `${err.name}: ${err.message}`
      console.warn(`[unhandled listener exception] ${err.stack ? `${head}\n${err.stack}` : head}`)
    } else {
      console.warn(`[unhandled listener exception] ${String(err)}`)
    }
  }
}

export function main(argv: string[]) {
  const application = new Application()
  return application.runAsync(argv)
}

const exit_code = await main([imports.system.programInvocationName].concat(ARGV))
log(`exit_code: ${exit_code}`)
system.exit(exit_code)
