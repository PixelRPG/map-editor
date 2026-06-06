import { isAbsoluteOrUrl } from './url.ts'

/**
 * Normalize a path into a fetch-compatible URL. In the browser, absolute
 * POSIX paths resolve relative to the origin. In GJS there is no origin, so
 * `fetch('/home/...')` raises `TypeError: Invalid URL` — prefix `file://` for
 * absolute local paths. URLs (http/https/file/data) are passed through.
 *
 * Exported so consumers can pre-normalize paths before handing them to
 * third-party libraries (e.g. Excalibur's `ImageSource`) that bypass our
 * `loadTextFile` wrapper.
 */
export function toFetchUrl(path: string): string {
  if (isAbsoluteOrUrl(path)) return path
  if (path.startsWith('/')) return `file://${path}`
  return path
}

/**
 * Normalise + fetch a path, throwing on a non-2xx response. Shared
 * transport for {@link loadTextFile} and {@link loadBinaryFile}.
 */
async function fetchOk(path: string): Promise<Response> {
  const url = toFetchUrl(path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load file: ${url} (${response.status})`)
  }
  return response
}

/**
 * Load a text file using fetch. Caller is responsible for log /
 * progress reporting — this helper is the low-level transport.
 */
export async function loadTextFile(path: string): Promise<string> {
  return await (await fetchOk(path)).text()
}

/**
 * Load a binary file as a Uint8Array via fetch — used by the
 * snapshot layer to embed sprite-set PNGs (and other binary
 * assets) inside the wire snapshot so a joiner without a local
 * project copy can still render the host's scene.
 *
 * Counterpart to {@link loadTextFile}: same `toFetchUrl`
 * normalisation, same error semantics (throws on non-2xx). Uses
 * `response.arrayBuffer()` so it stays cross-runtime (browser /
 * Node / GJS via `@gjsify/fetch`).
 */
export async function loadBinaryFile(path: string): Promise<Uint8Array> {
  const buf = await (await fetchOk(path)).arrayBuffer()
  return new Uint8Array(buf)
}
