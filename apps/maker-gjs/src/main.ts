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

export function main(argv: string[]) {
  const application = new Application()
  return application.runAsync(argv)
}

const exit_code = await main([imports.system.programInvocationName].concat(ARGV))
log(`exit_code: ${exit_code}`)
system.exit(exit_code)
