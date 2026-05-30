import type { SignallingTransport } from '@pixelrpg/engine'

import type { LanDiscoveryEvent } from './lan-discovery-parse.ts'
import { LanBrowser, LanPublisher, type SessionTxt } from './lan-discovery.ts'
import { connectLanJoinerTransport, startLanHostServer } from './lan-signalling.ts'
import { connectRelaySignalling, defaultRelayUrl } from './relay-signalling.ts'
import type { HostingHandle, HostingOptions, SessionBackend } from './session-service.ts'

/**
 * Production wiring of the {@link SessionBackend} contract.
 *
 *   - `startBrowsing` / `stopBrowsing` → {@link LanBrowser} over
 *     `_pixelrpg._tcp.local` mDNS.
 *
 *   - `startHosting`:
 *       1. bind a {@link startLanHostServer LAN signalling server} on
 *          an OS-picked port (passing `port: 0` lets the kernel
 *          choose, avoiding "address already in use" when several
 *          maker instances run on the same machine).
 *       2. advertise via Avahi {@link LanPublisher} with the bound
 *          port baked into the TXT record `signalPort=<n>`. Joiners
 *          read that TXT entry to know where to direct-connect.
 *
 *   - `connectLan` → {@link connectLanJoinerTransport}.
 *
 *   - `connectRelay` → {@link connectRelaySignalling} pointing at
 *     {@link defaultRelayUrl} (env-overridable; defaults to the
 *     hosted relay endpoint).
 *
 * Idempotent close — calling `stop*` while not started is a no-op,
 * and `startHosting`'s returned `close` may be invoked multiple
 * times safely.
 */
export class LanSessionBackend implements SessionBackend {
  private browser: LanBrowser | null = null
  private publisher: LanPublisher | null = null

  startBrowsing(onEvent: (event: LanDiscoveryEvent) => void): void {
    if (this.browser) return
    const browser = new LanBrowser()
    try {
      browser.start(onEvent)
      this.browser = browser
    } catch (err) {
      // `avahi-browse` missing → silently skip (Welcome view falls
      // back to an empty "Sessions on this network" pane).
      this.browser = null
      throw err
    }
  }

  stopBrowsing(): void {
    this.browser?.close()
    this.browser = null
  }

  async startHosting(opts: HostingOptions): Promise<HostingHandle> {
    if (this.publisher) {
      throw new Error('LanSessionBackend: already hosting — call close() on the previous handle first')
    }

    const peerCallbacks: Array<(t: SignallingTransport) => void> = []

    // Bind on 0.0.0.0 (all interfaces) instead of the previous
    // 127.0.0.1 default. Two same-machine instances over `dbus-run-
    // session` can talk over loopback either way, but Avahi-
    // resolution on a LAN interface (eth0 / wlan0) returns the
    // network IP — connecting to 127.0.0.1 from the joiner failed
    // when the resolution path picked the LAN interface even on the
    // same machine. Binding all-interfaces makes the published
    // port reachable regardless of which interface Avahi resolved
    // on. The privacy cost is real (the WS server is now reachable
    // from the LAN), but Pair-Editing is LAN-only by design.
    const server = await startLanHostServer({
      port: 0,
      host: '0.0.0.0',
      onPeerConnected: (transport) => {
        for (const cb of peerCallbacks) cb(transport)
      },
    })
    // Diagnostic: hand-test users have asked us to surface what
    // port we actually bound on vs what we advertised. One line
    // each; cheap to read in `dbus-run-session` two-instance
    // smoke tests, easy to remove later when the wiring is
    // proven solid.
    console.log(
      `[lan-session-backend] hosting session "${opts.sessionName}"`,
      `\n  bound on ${server.address.host}:${server.address.port}`,
      `\n  Avahi-advertised port: ${server.address.port}`,
    )

    const publisher = new LanPublisher()
    const txt: SessionTxt = {
      version: '1',
      kind: 'edit',
      room: opts.roomId,
      host: opts.hostDisplayName,
      project: opts.projectName,
      peers: '1/2',
      started: String(Math.floor(Date.now() / 1000)),
    }
    try {
      publisher.publish({
        name: opts.sessionName,
        port: server.address.port,
        txt,
      })
    } catch (err) {
      await server.close().catch(() => {})
      throw err
    }
    this.publisher = publisher

    return {
      port: server.address.port,
      onPeerConnected: (cb) => {
        peerCallbacks.push(cb)
      },
      close: async () => {
        this.publisher?.close()
        this.publisher = null
        await server.close().catch(() => {})
      },
    }
  }

  async connectLan(host: string, port: number): Promise<SignallingTransport> {
    return connectLanJoinerTransport(host, port)
  }

  async connectRelay(roomId: string, role: 'host' | 'joiner'): Promise<SignallingTransport> {
    return connectRelaySignalling({
      relayUrl: defaultRelayUrl(),
      roomId,
      role,
    })
  }
}
