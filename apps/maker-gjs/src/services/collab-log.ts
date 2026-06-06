/**
 * One logging + error-formatting story for every collab module.
 *
 * Before this module, each file invented its own variant:
 *
 *   - `console.warn('[lan-signalling] connect failed: ${err.message ?? err}')`
 *     — printed `[object Object]` when `err.message` was empty.
 *   - `console.warn('[orphan-cleanup] error:', err)` — printed `{}`
 *     because Error's enumerable properties are empty (the actual
 *     `message` + `stack` are non-enumerable, so GJS's console.warn
 *     stringifies the Error as an empty object).
 *   - `relay-signalling.ts` had no logging at all — failures were
 *     completely invisible.
 *
 * Every collab file now goes through {@link scopedLogger} so a single
 * pass over this module fixes the entire log surface. {@link
 * formatError} is the load-bearing piece — it handles every shape an
 * error can take in JS land (Error subclass, string, plain object,
 * null/undefined, circular ref) and always returns a printable string
 * carrying the operationally useful bits (name, message, stack).
 *
 * The sink indirection (default = real `console`; replaceable via
 * {@link setCollabLogSink}) lets tests assert log output without
 * mocking the global console.
 */

export type CollabLogLevel = 'info' | 'warn' | 'error'

export interface CollabLogSink {
  log(line: string): void
  warn(line: string): void
  error(line: string): void
}

const consoleSink: CollabLogSink = {
  log: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
}

let activeSink: CollabLogSink = consoleSink

/** Replace the default console sink — typically only useful in tests. */
export function setCollabLogSink(sink: CollabLogSink): void {
  activeSink = sink
}

/** Restore the default console sink. */
export function resetCollabLogSink(): void {
  activeSink = consoleSink
}

/**
 * Render any value as a printable string. The contract:
 *
 *   - `null` / `undefined` → `'null'` / `'undefined'`.
 *   - `string` → returned verbatim.
 *   - {@link Error} (or subclass) → `'<Name>: <message>\n<stack>'`. The
 *     stack is included when present so a logged failure is self-
 *     locating; `Name` is dropped when it's the unhelpful default
 *     `'Error'`.
 *   - plain object → `JSON.stringify(value)`, with a graceful
 *     fallback to `String(value)` for objects that can't be
 *     stringified (circular refs).
 *   - everything else (numbers, booleans, symbols, functions) →
 *     `String(value)`.
 *
 * The point of this function is to guarantee that NO collab error
 * log ever prints `{}` or `[object Object]` for an Error. That was
 * the proximate cause of the 2026-05-30 hand-test diagnostic gap.
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
 * Emit a single log line in the canonical `[scope] message` shape.
 * When `err` is provided, it's appended as `: <formatted error>`.
 */
export function emitCollabLog(scope: string, level: CollabLogLevel, message: string, err?: unknown): void {
  const head = `[${scope}] ${message}`
  const line = err === undefined ? head : `${head}: ${formatError(err)}`
  if (level === 'info') activeSink.log(line)
  else if (level === 'warn') activeSink.warn(line)
  else activeSink.error(line)
}

export interface ScopedLogger {
  info(message: string): void
  warn(message: string, err?: unknown): void
  error(message: string, err?: unknown): void
}

/**
 * Build a logger bound to a `[scope]` prefix.
 *
 * Typical usage at the top of a collab module:
 *
 * ```ts
 * const log = scopedLogger('lan-signalling')
 * log.info(`joiner connecting to ${url}`)
 * log.warn('joiner connect failed', err)
 * ```
 *
 * `info` deliberately doesn't accept an error argument — success
 * paths shouldn't be carrying errors. `warn` and `error` do, so the
 * one-arg failure shape ("something failed, here's why") stays
 * concise.
 */
export function scopedLogger(scope: string): ScopedLogger {
  return {
    info: (message) => emitCollabLog(scope, 'info', message),
    warn: (message, err) => emitCollabLog(scope, 'warn', message, err),
    error: (message, err) => emitCollabLog(scope, 'error', message, err),
  }
}

/**
 * Error subclass thrown when an operation exceeds its deadline.
 * Carries enough context for the user-facing toast to be descriptive
 * (operation name + URL) without leaking stack frames.
 */
export class CollabTimeoutError extends Error {
  public readonly operation: string
  public readonly timeoutMs: number
  public readonly url?: string
  constructor(operation: string, timeoutMs: number, url?: string) {
    const where = url ? ` (${url})` : ''
    super(`${operation} timed out after ${timeoutMs}ms${where}`)
    this.name = 'CollabTimeoutError'
    this.operation = operation
    this.timeoutMs = timeoutMs
    this.url = url
  }
}

/**
 * Race a promise against a deadline. On timeout, rejects with a
 * {@link CollabTimeoutError}; otherwise resolves/rejects exactly as
 * the input promise does. The underlying timer is always cleared so
 * the event loop can drain.
 *
 * `operation` is the human-readable verb used in the timeout
 * message (e.g. `'LAN signalling connect'`).
 */
export function withTimeout<T>(operation: string, timeoutMs: number, promise: Promise<T>, url?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CollabTimeoutError(operation, timeoutMs, url))
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
