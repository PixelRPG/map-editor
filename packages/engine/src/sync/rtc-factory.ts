import type { RTCPeerConnectionFactory } from './types.ts'

/**
 * Resolve the WebRTC constructor for this runtime.
 *
 * Browsers and GJS (with `@gjsify/webrtc/register` loaded) both expose
 * it as a global; Node has no native implementation. A caller that
 * neither injects a factory nor runs somewhere that provides one gets a
 * message naming both fixes, because the failure otherwise surfaces as
 * an opaque "not a constructor" deep inside session setup.
 */
export function resolveRtcFactory(injected?: RTCPeerConnectionFactory): RTCPeerConnectionFactory {
  const factory = injected ?? (globalThis as { RTCPeerConnection?: RTCPeerConnectionFactory }).RTCPeerConnection
  if (!factory) {
    throw new Error(
      'PeerSession: no RTCPeerConnection factory available — ' +
        'register `@gjsify/webrtc/register` under GJS, or inject `rtcFactory` in tests.',
    )
  }
  return factory
}
