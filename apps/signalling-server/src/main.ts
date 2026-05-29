import { startServer } from './server.ts'

const host = readEnv('PIXELRPG_SIGNALLING_HOST') ?? '127.0.0.1'
const port = Number(readEnv('PIXELRPG_SIGNALLING_PORT') ?? '8089')
const log = (readEnv('PIXELRPG_SIGNALLING_LOG') ?? 'info') as 'quiet' | 'info' | 'debug'

if (!Number.isFinite(port) || port < 1 || port > 65535) {
  console.error(`[signalling] invalid PIXELRPG_SIGNALLING_PORT: ${port}`)
  process.exit(2)
}

const handle = await startServer({ host, port, log })
console.log(`[signalling] listening on ws://${handle.address.host}:${handle.address.port}`)

// Best-effort graceful shutdown — Soup's `WebSocketServer.close`
// resolves once every active connection has been told to close.
const shutdown = async (signal: string) => {
  console.log(`[signalling] ${signal} received, shutting down`)
  await handle.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

/**
 * Read an env var while being polite about gjsify's GJS runtime —
 * GJS exposes env vars through `GLib.getenv` but `@gjsify/process`
 * mirrors them onto `process.env`, so this is identical to a Node
 * `process.env.X` read. Wrapped in a tiny helper so the entrypoint
 * stays a flat sequence of intent.
 */
function readEnv(name: string): string | undefined {
  return process.env[name]
}
