/**
 * Base64 encode/decode helpers for the snapshot wire format.
 *
 * The {@link ProjectSnapshot} embeds binary sprite-set images
 * (PNGs) as base64 strings so a remote joiner can rehydrate the
 * full project without a local asset bundle. JSON has no native
 * binary type — base64 is the standard escape hatch (RFC 4648).
 *
 * Why hand-rolled instead of `Buffer.from(...).toString('base64')`?
 * The engine is cross-runtime — same code path runs under GJS,
 * Node, and the browser. `btoa`/`atob` are available everywhere
 * (`@gjsify/buffer` registers them on GJS); `Buffer` is Node-only.
 *
 * The 32 KiB chunking on the encode side avoids
 * `RangeError: too many arguments` from `String.fromCharCode.apply`
 * with very large arrays — for the 70 KiB sprite-sheets we ship
 * today it's not strictly needed, but the call-site doesn't know
 * the upper bound and we'd rather be safe than tune-by-asset.
 */

const CHUNK_SIZE = 32 * 1024

/**
 * Encode a Uint8Array as a standard base64 string (RFC 4648
 * alphabet, `+/`, `=` padding). Output is suitable for embedding
 * inside JSON.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    binary += String.fromCharCode.apply(null, slice as unknown as number[])
  }
  return btoa(binary)
}

/**
 * Decode a base64 string back into a Uint8Array. Throws if the
 * string contains characters outside the standard alphabet —
 * callers feeding wire-data should wrap in try/catch and
 * surface a `parseProjectSnapshot: malformed images entry`
 * style error.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
