import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

import { scopedLogger } from './collab-log.ts'
import { type DiscoveredService, type LanDiscoveryEvent, parseAvahiBrowseLine } from './lan-discovery-parse.ts'

const log = scopedLogger('lan-discovery')

/**
 * mDNS service type the editor + future multiplayer both advertise.
 * The TXT-record schema is documented in `docs/concepts/
 * collaboration-and-multiplayer.md` § 6.
 */
export const SERVICE_TYPE = '_pixelrpg._tcp'

/**
 * Argv for the long-running `avahi-browse` subprocess. Exported as
 * a constant so unit tests can lock in the contract: NO `-t` flag
 * (terminate after initial dump) — without that guard the browser
 * exits after its first scan and the LanBrowser stops receiving
 * events for hosts that publish later.
 *
 * Flags:
 *   -r   resolve every appeared service (gives us address + TXT)
 *   -p   parseable line-oriented output (one event per line)
 */
export const AVAHI_BROWSE_ARGS: readonly string[] = ['avahi-browse', '-r', '-p', SERVICE_TYPE] as const

export interface SessionAdvertisement {
  /** Human-readable session label shown in the joiner's UI. */
  name: string
  /** TCP port the WebRTC offer endpoint (or signalling proxy) listens on. */
  port: number
  /** TXT records — drives the joiner's filter / status display. */
  txt: SessionTxt
}

export interface SessionTxt {
  version: string
  kind: 'edit' | 'play'
  room: string
  host: string
  project: string
  peers: string
  started: string
}

/**
 * Owns one `avahi-publish-service` subprocess that advertises the
 * local maker's session over mDNS. Removing the advertisement is as
 * simple as killing the child — Avahi automatically retracts the
 * record set within a couple of seconds. Idempotent close.
 *
 * Why not the Avahi GIR (`@girs/avahi-0.6`)? The GIR exposes only
 * `add_record`, not the high-level `ga_entry_group_add_service`, so
 * publishing a service would require hand-composing SRV / TXT / PTR
 * records. The CLI tool from `avahi-tools` ships on every Avahi
 * install and the subprocess wrapping stays under 30 lines —
 * pragmatic win over the GIR path.
 */
export class LanPublisher {
  private process: Gio.Subprocess | null = null
  private closed = false

  /** Start advertising. Throws if the `avahi-publish-service` binary is missing. */
  publish(ad: SessionAdvertisement): void {
    if (this.closed) throw new Error('LanPublisher: already closed')
    if (this.process) throw new Error('LanPublisher: already publishing')

    const args = ['avahi-publish-service', ad.name, SERVICE_TYPE, String(ad.port), ...txtToArgs(ad.txt)]
    try {
      this.process = Gio.Subprocess.new(args, Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE)
    } catch (err) {
      throw new Error(
        `LanPublisher: failed to start avahi-publish-service — is the avahi-tools package installed? (${
          err instanceof Error ? err.message : String(err)
        })`,
      )
    }
  }

  /** Stop advertising. Idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    if (!this.process) return
    try {
      // SIGINT is the documented exit signal for avahi-publish-service.
      // SIGINT (2) is the documented graceful-shutdown signal for
      // avahi-publish-service. The number is hard-coded — `GLib.SIGINT`
      // is not exposed through the @girs typings.
      this.process.send_signal(2)
    } catch {
      // Process may already be gone — best-effort.
    }
    this.process = null
  }
}

/**
 * Owns one `avahi-browse` subprocess streaming resolution events for
 * the editor's service type, parses each line and dispatches
 * `service-discovered` / `service-gone` callbacks. Forwarder is
 * the {@link parseAvahiBrowseLine} helper — keeps the streaming
 * shape minimal here.
 */
export class LanBrowser {
  private process: Gio.Subprocess | null = null
  // The avahi-browse subprocess's stdout pipe — held so it stays alive
  // for the lifetime of the reader and is dropped on close().
  private stdoutPipe: Gio.InputStream | null = null
  private closed = false
  private onEvent: ((event: LanDiscoveryEvent) => void) | null = null

  /**
   * Begin browsing. Subsequent events are delivered via `onEvent`.
   * Throws on missing binary; caller surfaces gracefully (the
   * Welcome view falls back to an empty "Sessions on this network"
   * pane rather than crashing).
   */
  start(onEvent: (event: LanDiscoveryEvent) => void): void {
    if (this.closed) throw new Error('LanBrowser: already closed')
    if (this.process) throw new Error('LanBrowser: already running')
    this.onEvent = onEvent

    const args = [...AVAHI_BROWSE_ARGS]
    log.info(`starting browser: ${args.join(' ')}`)
    try {
      this.process = Gio.Subprocess.new(args, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
    } catch (err) {
      this.onEvent = null
      throw new Error(
        `LanBrowser: failed to start avahi-browse — is the avahi-tools package installed? (${
          err instanceof Error ? err.message : String(err)
        })`,
      )
    }

    const stdout = this.process.get_stdout_pipe()
    if (!stdout) {
      this.close()
      throw new Error('LanBrowser: no stdout pipe on avahi-browse subprocess')
    }
    this.stdoutPipe = stdout
    const reader = new Gio.DataInputStream({ base_stream: stdout })
    this.readNext(reader)
  }

  /** Stop browsing. Idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.process) {
      try {
        this.process.force_exit()
      } catch {
        /* best-effort */
      }
      this.process = null
    }
    this.stdoutPipe = null
    this.onEvent = null
  }

  private readNext(reader: Gio.DataInputStream): void {
    reader.read_line_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
      if (this.closed) return
      try {
        const [line] = (source as Gio.DataInputStream).read_line_finish(result)
        if (line === null) {
          // EOF — avahi-browse died (binary went away?). Stop the loop.
          this.close()
          return
        }
        const decoded = typeof line === 'string' ? line : new TextDecoder().decode(line)
        const event = parseAvahiBrowseLine(decoded)
        if (event && this.onEvent) this.onEvent(event)
        this.readNext(reader)
      } catch {
        // Read error — assume the subprocess is gone, drop quietly.
        this.close()
      }
    })
  }
}

function txtToArgs(txt: SessionTxt): string[] {
  return Object.entries(txt).map(([key, value]) => `${key}=${value}`)
}

export type { DiscoveredService, LanDiscoveryEvent }
