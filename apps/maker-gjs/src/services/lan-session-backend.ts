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

    const server = await startLanHostServer({
      port: 0,
      onPeerConnected: (transport) => {
        for (const cb of peerCallbacks) cb(transport)
      },
    })

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
