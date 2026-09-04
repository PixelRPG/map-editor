/**
 * Snapshot path safety.
 *
 * These guards stand between a remote peer's wire payload and the
 * joiner's filesystem, so each rejection rule gets its own case: a hole
 * here is a remote arbitrary-file-write, and the failure is silent —
 * the joiner just ends up with a file somewhere it should not be.
 */

import { describe, expect, it } from '@gjsify/unit'

import { assertProjectFilename, assertSafeRelativePath, assertStaysInside, snapshotDirname } from './snapshot-paths.ts'

function rejects(fn: () => void): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

export default async () => {
  await describe('assertSafeRelativePath', async () => {
    await it('accepts ordinary relative paths', async () => {
      expect(rejects(() => assertSafeRelativePath('maps/town.json', 'p'))).toBe(false)
      expect(rejects(() => assertSafeRelativePath('a/b/c/d.png', 'p'))).toBe(false)
      expect(rejects(() => assertSafeRelativePath('..hidden/x.json', 'p'))).toBe(false)
    })

    await it('rejects an empty path', async () => {
      expect(rejects(() => assertSafeRelativePath('', 'p'))).toBe(true)
    })

    await it('rejects a parent-directory segment anywhere in the path', async () => {
      expect(rejects(() => assertSafeRelativePath('../etc/passwd', 'p'))).toBe(true)
      expect(rejects(() => assertSafeRelativePath('maps/../../etc/passwd', 'p'))).toBe(true)
      expect(rejects(() => assertSafeRelativePath('maps/..', 'p'))).toBe(true)
    })

    await it('rejects absolute POSIX paths', async () => {
      expect(rejects(() => assertSafeRelativePath('/etc/passwd', 'p'))).toBe(true)
      expect(rejects(() => assertSafeRelativePath('/dev/null', 'p'))).toBe(true)
    })

    await it('rejects drive letters and backslashes', async () => {
      expect(rejects(() => assertSafeRelativePath('C:/Windows/system32', 'p'))).toBe(true)
      expect(rejects(() => assertSafeRelativePath('maps\\town.json', 'p'))).toBe(true)
      expect(rejects(() => assertSafeRelativePath('\\\\server\\share', 'p'))).toBe(true)
    })

    await it('rejects an embedded NUL byte', async () => {
      // Filesystem APIs that truncate at NUL would write "safe.json"
      // somewhere the rest of the string points at.
      expect(rejects(() => assertSafeRelativePath('safe.json\0/etc/passwd', 'p'))).toBe(true)
    })

    await it('names the offending field in the message', async () => {
      try {
        assertSafeRelativePath('/etc/passwd', 'maps[].path')
        expect('should have thrown').toBe('but did not')
      } catch (err) {
        expect((err as Error).message.includes('maps[].path')).toBe(true)
      }
    })
  })

  await describe('assertProjectFilename', async () => {
    await it('accepts a single path component', async () => {
      expect(rejects(() => assertProjectFilename('game-project.json'))).toBe(false)
    })

    await it('rejects anything with a separator, even a safe relative one', async () => {
      expect(rejects(() => assertProjectFilename('sub/game-project.json'))).toBe(true)
    })

    await it('still applies the relative-path rules', async () => {
      expect(rejects(() => assertProjectFilename('/game-project.json'))).toBe(true)
      expect(rejects(() => assertProjectFilename(''))).toBe(true)
    })
  })

  await describe('assertStaysInside', async () => {
    await it('accepts a path under the target directory', async () => {
      expect(rejects(() => assertStaysInside('/tmp/sandbox', '/tmp/sandbox/maps/town.json', 'f'))).toBe(false)
    })

    await it('tolerates a trailing separator on the target', async () => {
      expect(rejects(() => assertStaysInside('/tmp/sandbox/', '/tmp/sandbox/a.json', 'f'))).toBe(false)
    })

    await it('rejects a sibling directory that shares the target prefix', async () => {
      // "/tmp/sandbox-evil" starts with "/tmp/sandbox" as a raw string;
      // the trailing-separator guard is what stops it.
      expect(rejects(() => assertStaysInside('/tmp/sandbox', '/tmp/sandbox-evil/a.json', 'f'))).toBe(true)
    })

    await it('rejects a join that escaped the target', async () => {
      expect(rejects(() => assertStaysInside('/tmp/sandbox', '/etc/passwd', 'f'))).toBe(true)
    })

    await it('rejects the target directory itself (a file must be inside it)', async () => {
      expect(rejects(() => assertStaysInside('/tmp/sandbox', '/tmp/sandbox', 'f'))).toBe(true)
    })
  })

  await describe('snapshotDirname', async () => {
    await it('strips the last segment', async () => {
      expect(snapshotDirname('/tmp/sandbox/spritesets/tiles.json')).toBe('/tmp/sandbox/spritesets')
    })

    await it('returns an empty string for a bare filename', async () => {
      expect(snapshotDirname('tiles.json')).toBe('')
    })

    await it('normalises backslashes before splitting', async () => {
      expect(snapshotDirname('a\\b\\c.json')).toBe('a\\b')
    })
  })
}
