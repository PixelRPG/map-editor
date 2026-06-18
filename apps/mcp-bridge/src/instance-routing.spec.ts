/**
 * Instance-label → D-Bus address routing for the MCP bridge.
 *
 * `sanitizeLabel` is a byte-identical copy of the maker's
 * `sanitizeInstanceId` (the bridge is dependency-free and can't import it);
 * the maker side is pinned by `apps/maker-gjs/src/instance-id.spec.ts`.
 * These cases MIRROR it so the two copies can't drift — if the bridge
 * sanitises a label differently from how the app derived its bus name, the
 * bridge dials a name nobody owns.
 *
 * `resolve` is the multi-instance addressing: the default instance keeps
 * the bare base name/path, a named one gets a suffixed bus name + path.
 */

import { describe, expect, it } from '@gjsify/unit'

import { BASE_NAME, BASE_PATH, resolve, sanitizeLabel } from './instance-routing.ts'

export default async () => {
  await describe('sanitizeLabel — bridge↔app contract', async () => {
    await it('lowercases and strips non-alphanumerics', async () => {
      expect(sanitizeLabel('My Test-Editor_2')).toBe('mytesteditor2')
    })

    await it('prefixes digit-led labels so the segment stays letter-led', async () => {
      expect(sanitizeLabel('2nd')).toBe('i2nd')
    })

    await it("maps an empty/cleaned-away label to 'i0'", async () => {
      expect(sanitizeLabel('')).toBe('i0')
      expect(sanitizeLabel('---')).toBe('i0')
    })

    await it('passes a plain lowercase label through unchanged', async () => {
      expect(sanitizeLabel('alpha')).toBe('alpha')
    })
  })

  await describe('resolve', async () => {
    await it('routes the default instance to the bare base name + path', async () => {
      expect(resolve()).toStrictEqual({
        busName: BASE_NAME,
        controlPath: `${BASE_PATH}/control`,
        label: 'default',
      })
    })

    await it("treats an explicit 'default' label the same as none", async () => {
      expect(resolve('default')).toStrictEqual(resolve())
    })

    await it('suffixes a named instance on both the bus name and the path', async () => {
      expect(resolve('Alpha')).toStrictEqual({
        busName: 'org.pixelrpg.maker.alpha',
        controlPath: '/org/pixelrpg/maker/alpha/control',
        label: 'alpha',
      })
    })

    await it('sanitises the label before routing (digit-led → i-prefixed)', async () => {
      expect(resolve('2nd')).toStrictEqual({
        busName: 'org.pixelrpg.maker.i2nd',
        controlPath: '/org/pixelrpg/maker/i2nd/control',
        label: 'i2nd',
      })
    })
  })
}
