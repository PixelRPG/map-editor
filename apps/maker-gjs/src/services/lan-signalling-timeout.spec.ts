/**
 * Timeout tests for {@link connectLanJoinerTransport}.
 *
 * The wire-format unit tests live in `lan-signalling.spec.ts`; the
 * happy-path end-to-end test (real WS server + joiner) lives in
 * `lan-signalling-integration.spec.ts`. THIS suite covers the
 * failure mode that bit the 2026-05-30 hand-test: WS upgrade
 * silently stalls and the joiner sits forever.
 *
 * Strategy: open a plain TCP server (NOT a WS server) on port 0 so
 * the joiner-side WebSocket can establish TCP but never receive the
 * HTTP/1.1 → WS upgrade response. The `ws` client will sit waiting
 * for the `101 Switching Protocols` until {@link withTimeout} fires.
 *
 * Runs on both Node (`net`) and GJS (`@gjsify/net` Soup-backed).
 */

import { describe, expect, it } from '@gjsify/unit'
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'net'

import { CollabTimeoutError } from './collab-log.ts'
import { connectLanJoinerTransport } from './lan-signalling.ts'

interface SilentServer {
  server: NetServer
  port: number
  close(): Promise<void>
}

async function listenSilent(): Promise<SilentServer> {
  const accepted: Socket[] = []
  const server = createNetServer((socket) => {
    accepted.push(socket)
    // Accept the TCP connection but never write the WS-upgrade reply.
    // Keep the socket open until the server closes; the joiner-side
    // ws client will time out waiting for `101 Switching Protocols`.
    socket.on('error', () => {
      /* peer reset on timeout — ignore */
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
    server.listen(0, '127.0.0.1')
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') {
    server.close()
    throw new Error('listenSilent: server.address() returned unexpected shape')
  }
  return {
    server,
    port: addr.port,
    // `server.close()` in Node waits for all open sockets to close
    // gracefully — but a half-open client (the joiner that already
    // received its own timeout) leaves its socket in CLOSE_WAIT
    // until the OS reaps it. Destroy every accepted socket
    // explicitly so the close() call returns within a couple of ms
    // instead of hanging the test harness.
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of accepted) {
          try {
            socket.destroy()
          } catch {
            /* already gone */
          }
        }
        server.close(() => resolve())
      }),
  }
}

export default async () => {
  await describe('connectLanJoinerTransport timeout (2026-05-30 regression)', async () => {
    await it('rejects with a CollabTimeoutError when the WS upgrade stalls', async () => {
      const silent = await listenSilent()
      try {
        let caught: unknown = null
        const t0 = Date.now()
        try {
          await connectLanJoinerTransport('127.0.0.1', silent.port, 200)
        } catch (err) {
          caught = err
        }
        const elapsed = Date.now() - t0
        expect(caught instanceof CollabTimeoutError).toBe(true)
        const timeoutErr = caught as CollabTimeoutError
        expect(timeoutErr.operation).toBe('LAN signalling connect')
        expect(timeoutErr.timeoutMs).toBe(200)
        expect(timeoutErr.url).toContain(`127.0.0.1:${silent.port}`)
        // Should fire within roughly the timeout, plus event-loop slack.
        // Allow generous upper bound for slow CI runners (1.5 s).
        expect(elapsed).toBeLessThan(1_500)
      } finally {
        await silent.close()
      }
    })

    await it('REGRESSION: the formatted error never reduces to "{}"', async () => {
      // The whole point of this PR: a logged failure surfaces a
      // human-readable reason, never `{}`. We re-derive the message
      // here via the same path the maker's toast handler uses.
      const err = new CollabTimeoutError('LAN signalling connect', 100, 'ws://127.0.0.1:1234/')
      expect(String(err)).toContain('100ms')
      expect(String(err)).toContain('ws://127.0.0.1:1234/')
      expect(JSON.stringify(err)).not.toBe('{}')
      // Even if JSON.stringify returned `{}`, our formatError doesn't
      // call it on Error subclasses — it walks message+name+stack.
      // Cross-check with toString() so the user-facing path is solid.
      expect(err.message.length).toBeGreaterThan(0)
    })
  })
}
