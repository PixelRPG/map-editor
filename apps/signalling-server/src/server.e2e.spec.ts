import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

/**
 * End-to-end smoke test: spawn the built GJS bundle and have two
 * `ws.WebSocket` clients walk through the full join → relay → bye
 * cycle. Proves the gjsify Soup-backed server actually shakes hands
 * with Node's `ws` client. Skipped when the bundle is missing — the
 * unit test pass is still authoritative for the routing logic; this
 * additionally validates the runtime wiring.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUNDLE = resolve(HERE, '..', 'org.pixelrpg.signalling-server')
/**
 * Port chosen per test run from a random ephemeral slot to dodge
 * "still bound from the previous run after a crashed afterAll"
 * surprises during dev — CI re-uses the same value across runs but
 * always gets a fresh process so it's irrelevant there.
 */
const PORT = 18000 + Math.floor(Math.random() * 1000)

type ServerProcess = ChildProcessByStdio<null, Readable, Readable>
let server: ServerProcess | null = null

beforeAll(async () => {
  const child: ServerProcess = spawn('gjsify', ['run', BUNDLE], {
    env: {
      ...process.env,
      PIXELRPG_SIGNALLING_HOST: '127.0.0.1',
      PIXELRPG_SIGNALLING_PORT: String(PORT),
      PIXELRPG_SIGNALLING_LOG: 'quiet',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server = child

  let stderrBuf = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
  })
  child.on('error', (err: Error) => {
    throw new Error(`spawn failed: ${err.message}`)
  })

  // Probe the port via a TCP connect — more robust than scraping
  // stdout for the "listening" log line (which can be lost behind
  // gjsify's launcher wrapper).
  const start = Date.now()
  let lastErr: unknown = null
  while (Date.now() - start < 20000) {
    try {
      const probe = new WebSocket(`ws://127.0.0.1:${PORT}/room/probe?role=joiner`)
      await new Promise<void>((resolveProbe, rejectProbe) => {
        const t = setTimeout(() => rejectProbe(new Error('probe timeout')), 500)
        probe.once('open', () => {
          clearTimeout(t)
          probe.close()
          resolveProbe()
        })
        probe.once('error', (err) => {
          clearTimeout(t)
          rejectProbe(err)
        })
      })
      return
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error(`server never accepted a probe connection — last error: ${String(lastErr)}\nstderr: ${stderrBuf}`)
}, 30000)

afterAll(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM')
    await new Promise<void>((resolveExit) => {
      const t = setTimeout(() => resolveExit(), 3000)
      server?.once('exit', () => {
        clearTimeout(t)
        resolveExit()
      })
    })
  }
})

describe('signalling-server end-to-end', () => {
  it('relays an SDP frame from host to joiner and an ICE frame back', async () => {
    const room = 'e2e-relay'
    const host = await openSocket(`ws://127.0.0.1:${PORT}/room/${room}?role=host`)
    const joiner = await openSocket(`ws://127.0.0.1:${PORT}/room/${room}?role=joiner`)

    const hostRecvd = collectMessages(host)
    const joinerRecvd = collectMessages(joiner)

    // The server's `connection` handler runs after the client's
    // `open` event due to async `verifyClient`; give the room
    // bookkeeping a tick to catch up before sending.
    await new Promise((r) => setTimeout(r, 100))

    host.send(JSON.stringify({ type: 'sdp', payload: { sdp: 'fake-offer', type: 'offer' } }))
    joiner.send(JSON.stringify({ type: 'ice-candidate', payload: { candidate: 'fake-candidate' } }))

    // One round-trip each direction — wait for both to land.
    await waitFor(() => hostRecvd.frames.length >= 1 && joinerRecvd.frames.length >= 1, 2000)

    expect(joinerRecvd.frames).toEqual([
      JSON.stringify({ type: 'sdp', payload: { sdp: 'fake-offer', type: 'offer' } }),
    ])
    expect(hostRecvd.frames).toEqual([
      JSON.stringify({ type: 'ice-candidate', payload: { candidate: 'fake-candidate' } }),
    ])

    host.close()
    joiner.close()
  }, 15000)

  it('rejects a second peer claiming the host slot in an occupied room', async () => {
    const room = 'e2e-conflict'
    const host = await openSocket(`ws://127.0.0.1:${PORT}/room/${room}?role=host`)
    const second = new WebSocket(`ws://127.0.0.1:${PORT}/room/${room}?role=host`)

    const closeCode = await new Promise<number>((resolveCode) => {
      second.on('close', (code) => resolveCode(code))
    })
    expect(closeCode).toBe(1008)
    host.close()
  }, 15000)

  it('rejects an upgrade with an invalid role query', async () => {
    // verifyClient → cb(false, 400, …) surfaces on the client as an
    // 'unexpected-response' error with the HTTP status attached.
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/room/foo?role=spectator`)
    const status = await new Promise<number>((resolveStatus, rejectStatus) => {
      const t = setTimeout(() => rejectStatus(new Error('no response')), 5000)
      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(t)
        resolveStatus(res.statusCode ?? 0)
      })
      ws.on('error', (e) => {
        clearTimeout(t)
        rejectStatus(e)
      })
    })
    expect(status).toBe(400)
  }, 15000)
})

async function openSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url)
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const t = setTimeout(() => rejectOpen(new Error(`open timeout: ${url}`)), 5000)
    ws.once('open', () => {
      clearTimeout(t)
      resolveOpen()
    })
    ws.once('error', (e) => {
      clearTimeout(t)
      rejectOpen(e)
    })
  })
  return ws
}

function collectMessages(ws: WebSocket): { frames: string[] } {
  const bucket: { frames: string[] } = { frames: [] }
  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    const text = typeof data === 'string' ? data : data.toString()
    bucket.frames.push(text)
  })
  return bucket
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`)
}
