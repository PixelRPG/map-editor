# @pixelrpg/signalling-server

Stateless WebSocket relay that brokers WebRTC SDP / ICE-candidate
exchange between two `PixelRPG` peers connecting across networks
(when LAN auto-discovery via Avahi mDNS is not viable).

Runs as a single GJS bundle built by `gjsify build --app gjs` —
no Node runtime needed at production. The same TypeScript source
is unit-tested under Node via Vitest because the routing logic
is pure data shuffling with mockable peer interfaces.

This package doubles as a real-world dogfooding test of gjsify's
Soup-backed `@gjsify/ws` + `@gjsify/http` server APIs.

## Protocol

```
WS upgrade @ /room/<roomid>?role=host|joiner

  → server creates the room on first connect, drops it after 5 min idle
  → client → server messages:
        { type: 'sdp';            payload: RTCSessionDescriptionInit }
        { type: 'ice-candidate';  payload: RTCIceCandidateInit | null }
        { type: 'bye';            payload?: { reason?: string } }
  → server fans each message to the OTHER role in the room
    (never echoes back to sender)
  → on disconnect: drop that role's slot, close room if both gone
```

No persistence. No auth. End-to-end encryption is the WebRTC
DTLS layer's job — the relay only sees opaque message envelopes.

## Run locally

```
gjsify workspace @pixelrpg/signalling-server build
gjsify workspace @pixelrpg/signalling-server start

# default: 127.0.0.1:8089
# env vars:
#   PIXELRPG_SIGNALLING_HOST  (default 127.0.0.1)
#   PIXELRPG_SIGNALLING_PORT  (default 8089)
#   PIXELRPG_SIGNALLING_LOG   (default info; quiet | info | debug)
```

## Test

```
gjsify workspace @pixelrpg/signalling-server test
```

Unit tests cover the `RoomManager` routing logic with mocked peers.
For an end-to-end smoke test against a running server, see
`scripts/smoke-test.mjs`.
