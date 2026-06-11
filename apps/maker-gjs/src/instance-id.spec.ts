/**
 * Pins the PIXELRPG_INSTANCE label → app-id-segment mapping that BOTH
 * the maker (`instance-id.ts` `sanitizeInstanceId`, derives the bus
 * name it owns) and the MCP bridge (`apps/mcp-bridge/src/index.ts`
 * `sanitizeLabel`, derives the bus name it dials) implement as
 * deliberately duplicated, byte-identical copies — the bridge is
 * dependency-free and cannot import the maker's. If either copy
 * drifts, multi-instance addressing breaks silently (the bridge polls
 * a name the app never claims), so this spec is the shared contract:
 * a change here must land in BOTH files.
 */

import { describe, expect, it } from '@gjsify/unit'

import { sanitizeInstanceId } from './instance-id.ts'

export default async () => {
  await describe('sanitizeInstanceId — bridge↔app contract', async () => {
    await it('lowercases and strips non-alphanumerics', async () => {
      expect(sanitizeInstanceId('My Test-Editor_2')).toBe('mytesteditor2')
    })

    await it('prefixes digit-led labels so the segment stays letter-led', async () => {
      expect(sanitizeInstanceId('2nd')).toBe('i2nd')
    })

    await it("maps an empty/cleaned-away label to 'i0'", async () => {
      expect(sanitizeInstanceId('')).toBe('i0')
      expect(sanitizeInstanceId('---')).toBe('i0')
    })

    await it('passes a plain lowercase label through unchanged', async () => {
      expect(sanitizeInstanceId('alpha')).toBe('alpha')
    })
  })
}
