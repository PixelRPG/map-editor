/**
 * Real-Avahi end-to-end integration test for `LanPublisher` +
 * `LanBrowser`. Actually spawns the `avahi-publish-service` and
 * `avahi-browse` subprocesses, lets them go through the live
 * mDNS round-trip via the system's `avahi-daemon`, and asserts
 * the browser sees the publisher.
 *
 * This is the test that catches the 2026-05-30 hand-test bug
 * ("joiner's discovery never sees the host"):
 *
 *   - Pre-fix: `avahi-browse -t` exited after the cold-start
 *     scan; LanBrowser saw EOF, closed itself, never recovered.
 *   - Test reproduces the exact run shape (publisher started
 *     AFTER browser) — fails with the old args, passes with
 *     the new args.
 *
 * GJS-only — uses `Gio.Subprocess` directly. Skips gracefully
 * when Avahi isn't available (CI without `avahi-tools` /
 * `avahi-daemon`).
 *
 * The test uses a unique service type per run (`_pixelrpgtest…
 * ._tcp`) so concurrent runs / dev-machine pollution don't
 * cross-contaminate.
 */

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { describe, expect, it, on } from '@gjsify/unit'

import { LanBrowser, LanPublisher } from './lan-discovery.ts'

/**
 * Per-process unique service type so parallel runs don't see each other.
 * Uses `Math.random()` (cross-platform) rather than `GLib.random_int_range`
 * so the MODULE LOAD doesn't crash under Node — the spec file is GJS-only
 * at runtime (gated below) but its module-top-level code still executes
 * on Node when the test bundle imports it.
 */
const TEST_SERVICE_TYPE = `_pixelrpgtest${Math.floor(1000 + Math.random() * 9000)}._tcp`

/** Quick probe — `avahi-browse` is on PATH AND a `avahi-daemon` is reachable. */
function avahiAvailable(): boolean {
  try {
    const probe = Gio.Subprocess.new(
      ['avahi-browse', '--help'],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    probe.wait(null)
    if (!probe.get_successful()) return false
  } catch {
    return false
  }
  // A daemon check is harder without sending a real query; the
  // first integration test below will time out if the daemon is
  // missing, which is the right failure mode.
  return true
}

/** Poll-wait for `predicate` up to `timeoutMs`. Uses `Date.now()` so
 * the helper definition doesn't pull GLib at module load. */
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise<void>((r) => setTimeout(r, 25))
  }
  return predicate()
}

/**
 * Spawn `avahi-publish-service` directly (bypassing LanPublisher
 * — the production publisher only accepts the SessionTxt schema,
 * and we want a minimal fixture here). Returns a cleanup
 * function.
 */
function publishTestService(name: string, port: number): () => void {
  const proc = Gio.Subprocess.new(
    [
      'avahi-publish-service',
      name,
      TEST_SERVICE_TYPE,
      String(port),
      'kind=test',
      `started=${Math.floor(Date.now() / 1000)}`,
    ],
    Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
  )
  return () => {
    try {
      proc.send_signal(2)
    } catch {
      /* already gone */
    }
  }
}

export default async () => {
  await on('Gjs', async () => {
    if (!avahiAvailable()) {
      console.log('[lan-discovery-integration] avahi-tools not available — skipping suite')
      return
    }

    await describe('LanBrowser real-Avahi end-to-end', async () => {
      await it('sees a service published AFTER the browser starts', async () => {
        // This is the regression — pre-fix `avahi-browse -t`
        // exited on the cold-start empty scan and the browser
        // missed the publish that happened a moment later.
        const events: Array<{ kind: string; name: string }> = []
        // Build a one-off browser pinned to our test service type
        // (LanBrowser hard-codes the production SERVICE_TYPE).
        const browserProc = Gio.Subprocess.new(
          ['avahi-browse', '-r', '-p', TEST_SERVICE_TYPE],
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
        )
        const stdout = browserProc.get_stdout_pipe()
        if (!stdout) throw new Error('no stdout pipe')
        const reader = new Gio.DataInputStream({ base_stream: stdout })

        let readerClosed = false
        const readLoop = (): void => {
          if (readerClosed) return
          reader.read_line_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            if (readerClosed) return
            try {
              const [line] = (source as Gio.DataInputStream).read_line_finish(result)
              if (line === null) {
                readerClosed = true
                return
              }
              const decoded = typeof line === 'string' ? line : new TextDecoder().decode(line)
              if (decoded.startsWith('=') || decoded.startsWith('+') || decoded.startsWith('-')) {
                const fields = decoded.split(';')
                events.push({ kind: decoded[0], name: fields[3] ?? '' })
              }
              readLoop()
            } catch {
              readerClosed = true
            }
          })
        }
        readLoop()

        // Wait a beat to make sure the browser is fully up, THEN publish.
        await new Promise<void>((r) => setTimeout(r, 200))
        const cleanup = publishTestService('e2e-test-service', 9999)
        try {
          const sawResolve = await waitFor(
            () => events.some((e) => e.kind === '=' && e.name === 'e2e-test-service'),
            5_000,
          )
          expect(sawResolve).toBe(true)
        } finally {
          readerClosed = true
          cleanup()
          try {
            browserProc.force_exit()
          } catch {
            /* already gone */
          }
        }
      })

      await it('LanPublisher + LanBrowser via the production wrappers', async () => {
        // This time use the actual production classes — proves
        // both ends wire correctly to the real Avahi binaries.
        // Limitation: LanPublisher/LanBrowser hard-code the
        // production SERVICE_TYPE, so this test sees real
        // ambient sessions if any are running. We tag with a
        // unique service name to filter for ourselves.
        const sessionName = `e2e-test-${Math.floor(10_000 + Math.random() * 90_000)}`
        const browser = new LanBrowser()
        const seenNames: string[] = []
        browser.start((event) => {
          if (event.kind === 'resolved') seenNames.push(event.service.name)
        })

        await new Promise<void>((r) => setTimeout(r, 200))

        const publisher = new LanPublisher()
        publisher.publish({
          name: sessionName,
          port: 8765,
          txt: {
            version: '1',
            kind: 'edit',
            room: 'integration-test',
            host: 'tester',
            project: 'Integration',
            peers: '1/2',
            started: String(Math.floor(Date.now() / 1000)),
          },
        })

        try {
          const sawOurName = await waitFor(() => seenNames.includes(sessionName), 5_000)
          expect(sawOurName).toBe(true)
        } finally {
          publisher.close()
          browser.close()
        }
      })
    })
  })
}
