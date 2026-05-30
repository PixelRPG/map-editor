/**
 * Contract tests for the `avahi-browse` and `avahi-publish-service`
 * argv shapes. These live as plain unit tests (no subprocess
 * spawning) because the bugs they catch are configuration bugs
 * caught at the wrong layer — a CI that runs Avahi end-to-end
 * would catch them too, but at higher infra cost and only in the
 * GJS-runtime slot.
 *
 * The regression that motivated this suite (2026-05-30): joiner's
 * Welcome view stayed empty even when a host on the same LAN was
 * actively publishing. Root cause: `avahi-browse -t` exits after
 * its first scan; if the cold-start scan finds no services, the
 * subprocess dies and the maker never re-tries. Removing `-t`
 * keeps the subprocess alive for continuous monitoring.
 */

import { describe, expect, it } from '@gjsify/unit'

import { AVAHI_BROWSE_ARGS, SERVICE_TYPE } from './lan-discovery.ts'

export default async () => {
  await describe('AVAHI_BROWSE_ARGS', async () => {
    await it('starts with `avahi-browse`', async () => {
      expect(AVAHI_BROWSE_ARGS[0]).toBe('avahi-browse')
    })

    await it('includes -r (resolve) so we get addresses + TXT', async () => {
      expect(AVAHI_BROWSE_ARGS).toContain('-r')
    })

    await it('includes -p (parsable line-oriented output)', async () => {
      expect(AVAHI_BROWSE_ARGS).toContain('-p')
    })

    await it('targets our service type', async () => {
      expect(AVAHI_BROWSE_ARGS).toContain(SERVICE_TYPE)
    })

    await it('does NOT include -t (terminate) — the bug the suite was created for', async () => {
      // `-t` makes avahi-browse exit after the initial scan. The
      // LanBrowser treats stdout EOF as "subprocess died" and
      // closes itself, so hosts that publish later go undiscovered.
      // Keep the subprocess long-running.
      expect(AVAHI_BROWSE_ARGS).not.toContain('-t')
    })

    await it('does NOT include -c (cache-only) — would be the same class of bug', async () => {
      // `-c` makes avahi-browse exit after dumping the cache.
      // Same EOF-kills-the-browser problem as -t. Listed
      // explicitly so a future "let's only see cached entries"
      // refactor can't slip past unit tests.
      expect(AVAHI_BROWSE_ARGS).not.toContain('-c')
    })
  })
}
