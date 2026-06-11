/**
 * Render a thrown/rejected value as a readable string — a bare
 * `console.warn(..., err)` of an Error prints `{}` in GJS, so every
 * log/diagnostic site routes through here. ONE definition: four
 * subsystem-local variants previously formatted the same failure
 * differently depending on which layer caught it.
 */
export function formatError(err: unknown): string {
  if (err === null) return 'null'
  if (err === undefined) return 'undefined'
  if (typeof err === 'string') return err
  if (err instanceof Error) {
    const name = err.name && err.name !== 'Error' ? `${err.name}: ` : ''
    const stack = err.stack ? `\n${err.stack}` : ''
    return `${name}${err.message}${stack}`
  }
  if (typeof err === 'object') {
    try {
      return JSON.stringify(err)
    } catch {
      // Circular refs, BigInt, etc. — fall through to String().
      return String(err)
    }
  }
  return String(err)
}

/**
 * Single-line variant (name + message, no stack) for compact log lines
 * like `PeerSession`'s per-event plog entries.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name && err.name !== 'Error' ? `${err.name}: ` : ''
    return `${name}${err.message}`
  }
  return formatError(err)
}
