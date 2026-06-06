import { describe, expect, it } from '@gjsify/unit'

import {
  CollabTimeoutError,
  emitCollabLog,
  formatError,
  resetCollabLogSink,
  scopedLogger,
  setCollabLogSink,
  withTimeout,
} from './collab-log.ts'

interface CapturedLine {
  level: 'log' | 'warn' | 'error'
  line: string
}

function createCapturingSink(): {
  lines: CapturedLine[]
  sink: { log: (l: string) => void; warn: (l: string) => void; error: (l: string) => void }
} {
  const lines: CapturedLine[] = []
  return {
    lines,
    sink: {
      log: (line) => lines.push({ level: 'log', line }),
      warn: (line) => lines.push({ level: 'warn', line }),
      error: (line) => lines.push({ level: 'error', line }),
    },
  }
}

export default async () => {
  await describe('formatError', async () => {
    await it('returns the string verbatim when given a string', async () => {
      expect(formatError('boom')).toBe('boom')
    })

    await it('returns "null" / "undefined" so they never silently swallow', async () => {
      expect(formatError(null)).toBe('null')
      expect(formatError(undefined)).toBe('undefined')
    })

    await it('extracts message + name + stack from Error', async () => {
      const err = new TypeError('bad input')
      const formatted = formatError(err)
      expect(formatted).toContain('TypeError: ')
      expect(formatted).toContain('bad input')
      // Stack frames carry the test file path or at least 'formatError'.
      expect(formatted.length).toBeGreaterThan('TypeError: bad input'.length)
    })

    await it('omits the trivial "Error: " prefix for default Error', async () => {
      const err = new Error('plain')
      const formatted = formatError(err)
      expect(formatted.startsWith('plain')).toBe(true)
      expect(formatted.startsWith('Error: ')).toBe(false)
    })

    await it('REGRESSION (2026-05-30 {}): Error never reduces to "{}"', async () => {
      // This is THE marker. Pre-fix, `console.warn('prefix:', err)` on
      // any Error printed `{}` because Error's enumerable properties
      // are empty. After this commit every collab module routes
      // through formatError, which carries message + stack — so
      // `{}` must never appear in the output.
      const cases: unknown[] = [
        new Error('a'),
        new TypeError('b'),
        new RangeError('c'),
        Object.assign(new Error('d'), { code: 'EHOSTUNREACH' }),
      ]
      for (const err of cases) {
        const formatted = formatError(err)
        expect(formatted).not.toBe('{}')
        expect(formatted).not.toBe('[object Object]')
        expect(formatted.length).toBeGreaterThan(0)
      }
    })

    await it('JSON-stringifies plain objects', async () => {
      expect(formatError({ code: 42, where: 'lan' })).toBe('{"code":42,"where":"lan"}')
    })

    await it('falls back to String() on circular objects', async () => {
      const a: { self?: unknown } = {}
      a.self = a
      // Don't assert exact text — just that it doesn't throw + returns SOMETHING.
      const formatted = formatError(a)
      expect(typeof formatted).toBe('string')
      expect(formatted.length).toBeGreaterThan(0)
    })

    await it('coerces non-objects via String()', async () => {
      expect(formatError(42)).toBe('42')
      expect(formatError(true)).toBe('true')
    })
  })

  await describe('emitCollabLog + scopedLogger', async () => {
    await it('prefixes every line with [scope]', async () => {
      const { lines, sink } = createCapturingSink()
      setCollabLogSink(sink)
      try {
        emitCollabLog('lan-signalling', 'info', 'connecting to host')
        emitCollabLog('lan-signalling', 'warn', 'connect failed', new Error('refused'))
      } finally {
        resetCollabLogSink()
      }
      expect(lines).toHaveLength(2)
      expect(lines[0].level).toBe('log')
      expect(lines[0].line).toBe('[lan-signalling] connecting to host')
      expect(lines[1].level).toBe('warn')
      expect(lines[1].line.startsWith('[lan-signalling] connect failed: ')).toBe(true)
      expect(lines[1].line).toContain('refused')
    })

    await it('scopedLogger routes through the same sink', async () => {
      const { lines, sink } = createCapturingSink()
      setCollabLogSink(sink)
      const log = scopedLogger('orphan-cleanup')
      try {
        log.info('killed leftover pid=1234')
        log.warn('error inspecting pid=1234', new Error('EACCES'))
        log.error('scan failed', new TypeError('bad enum'))
      } finally {
        resetCollabLogSink()
      }
      expect(lines.map((l) => l.level)).toStrictEqual(['log', 'warn', 'error'])
      expect(lines[0].line).toBe('[orphan-cleanup] killed leftover pid=1234')
      expect(lines[1].line.startsWith('[orphan-cleanup] error inspecting pid=1234: ')).toBe(true)
      expect(lines[1].line).toContain('EACCES')
      expect(lines[2].line).toContain('TypeError')
      expect(lines[2].line).toContain('bad enum')
    })

    await it('does not call the sink for the wrong level', async () => {
      const { lines, sink } = createCapturingSink()
      setCollabLogSink(sink)
      const log = scopedLogger('test')
      try {
        log.info('only info')
      } finally {
        resetCollabLogSink()
      }
      expect(lines).toHaveLength(1)
      expect(lines[0].level).toBe('log')
    })
  })

  await describe('withTimeout / CollabTimeoutError', async () => {
    await it('resolves with the inner value when the promise wins', async () => {
      const result = await withTimeout('op', 500, Promise.resolve(42))
      expect(result).toBe(42)
    })

    await it('rejects with the inner error when the promise rejects', async () => {
      let caught: unknown = null
      try {
        await withTimeout('op', 500, Promise.reject(new Error('inner')))
      } catch (err) {
        caught = err
      }
      expect(caught instanceof Error).toBe(true)
      expect((caught as Error).message).toBe('inner')
    })

    await it('rejects with a CollabTimeoutError when the deadline passes', async () => {
      const stuck = new Promise<never>(() => {
        /* never resolves */
      })
      let caught: unknown = null
      try {
        await withTimeout('LAN connect', 25, stuck, 'ws://example/')
      } catch (err) {
        caught = err
      }
      expect(caught instanceof CollabTimeoutError).toBe(true)
      const timeoutErr = caught as CollabTimeoutError
      expect(timeoutErr.operation).toBe('LAN connect')
      expect(timeoutErr.timeoutMs).toBe(25)
      expect(timeoutErr.url).toBe('ws://example/')
      expect(timeoutErr.message).toContain('25ms')
      expect(timeoutErr.message).toContain('ws://example/')
    })

    await it('formatError on a CollabTimeoutError carries the operation + url', async () => {
      const err = new CollabTimeoutError('relay connect', 10_000, 'wss://relay/x')
      const formatted = formatError(err)
      expect(formatted).toContain('CollabTimeoutError')
      expect(formatted).toContain('10000ms')
      expect(formatted).toContain('wss://relay/x')
    })
  })
}
