/**
 * Pure-logic unit tests for the orphan-detection predicate.
 *
 * The actual `cleanupOrphanedPublishers()` scans real `/proc` and
 * sends real SIGTERM — that's GJS-only and OS-specific, exercised
 * by hand. What we CAN test cross-platform: the discrimination
 * logic (`isOrphanedPixelrpgPublisher`) against in-memory `/proc`
 * fixtures via the `ProcReaders` injection.
 *
 * Regression coverage for the 2026-05-30 hand-test bug:
 *
 *   - Previous version: only flagged `PPid == 1` as orphan.
 *   - User-machine reality: orphan had `PPid == 6308` (user-
 *     systemd), got silently skipped, lingered for 3 hours.
 *
 * The "parent comm == systemd" test below would have failed
 * against the old code and passes against the new one.
 */

import { describe, expect, it } from '@gjsify/unit'

import { isOrphanedPixelrpgPublisher, type ProcReaders } from './orphan-publisher-cleanup.ts'

/** Build a `ProcReaders` over an in-memory fixture map. */
function fixture(
  procs: Record<number, { comm?: string; cmdline?: string[]; ppid?: number }>,
): ProcReaders {
  return {
    readComm: (pid) => procs[pid]?.comm ?? null,
    readCmdlineArgs: (pid) => procs[pid]?.cmdline ?? null,
    readPpid: (pid) => procs[pid]?.ppid ?? null,
  }
}

export default async () => {
  await describe('isOrphanedPixelrpgPublisher — reaper-aware orphan detection', async () => {
    await it('flags an avahi-publish-service whose parent is PID 1 (classic init)', async () => {
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'Foo', '_pixelrpg._tcp', '8080'],
          ppid: 1,
        },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(true)
    })

    await it('flags an avahi-publish-service whose parent is systemd-user (the 2026-05-30 regression)', async () => {
      // The bug: previous logic only checked PPid == 1, missed
      // orphans reaped by systemd-user. Real-world `/proc/<pid>/
      // status` for the user's orphan said `PPid: 6308`, and
      // `/proc/6308/comm` said `systemd`.
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'Pixel RPG Adventure', '_pixelrpg._tcp', '33295'],
          ppid: 6308,
        },
        6308: { comm: 'systemd' },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(true)
    })

    await it('flags when parent comm is "init" (Alpine-style)', async () => {
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'X', '_pixelrpg._tcp', '8080'],
          ppid: 7,
        },
        7: { comm: 'init' },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(true)
    })

    await it('does NOT flag when the parent is a live maker (gjs process)', async () => {
      // Co-tenant: a second running maker on this user. Its
      // publisher's parent is the maker's `gjs` process, not a
      // reaper. We must NOT kill it.
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'Other Maker', '_pixelrpg._tcp', '8080'],
          ppid: 5555,
        },
        5555: { comm: 'gjs' },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(false)
    })

    await it('does NOT flag a different service type (would be cross-user / cross-app interference)', async () => {
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'PrinterShare', '_ipp._tcp', '631'],
          ppid: 1,
        },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(false)
    })

    await it('does NOT flag a process that is not avahi-publish-service at all', async () => {
      const readers = fixture({
        100: { comm: 'firefox', cmdline: ['firefox'], ppid: 1 },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(false)
    })

    await it('returns false on missing /proc data (defensive)', async () => {
      const readers = fixture({})
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(false)
    })

    await it('returns false when the parent comm cannot be read (systemd-user check fails open)', async () => {
      // Parent PID is something other than 1, but we can't read
      // its comm — refuse to kill rather than guess.
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s',
          cmdline: ['avahi-publish-service', 'X', '_pixelrpg._tcp', '8080'],
          ppid: 9999,
        },
        // 9999 not in fixture → readComm returns null
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(false)
    })

    await it('respects the 15-char comm-truncation reality', async () => {
      // `/proc/<pid>/comm` is hard-capped at 15 chars + newline
      // (kernel `TASK_COMM_LEN = 16`). For
      // `avahi-publish-service` (21 chars) the kernel truncates
      // to `avahi-publish-s`. Verified empirically by spawning
      // the binary and reading `/proc/<pid>/comm` during the
      // test-scaffold pass.
      const readers = fixture({
        100: {
          comm: 'avahi-publish-s\n',
          cmdline: ['avahi-publish-service', 'X', '_pixelrpg._tcp', '8080'],
          ppid: 1,
        },
      })
      expect(isOrphanedPixelrpgPublisher(100, readers)).toBe(true)
    })
  })
}
