import { describe, expect, it } from '@gjsify/unit'

import { parseAvahiBrowseLine } from './lan-discovery-parse.ts'

export default async () => {
  await describe('parseAvahiBrowseLine', async () => {
    await it('parses a resolution line with TXT records', async () => {
      const event = parseAvahiBrowseLine(
        '=;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local;bob.local;192.168.1.42;8088;' +
          '"version=1" "kind=edit" "room=a3f2-bb91" "host=Bob" "project=Forest" "peers=1/4" "started=1716968400"',
      )
      expect(event).toStrictEqual({
        kind: 'resolved',
        service: {
          name: 'Bob%27s Project',
          host: 'bob.local',
          address: '192.168.1.42',
          port: 8088,
          txt: {
            version: '1',
            kind: 'edit',
            room: 'a3f2-bb91',
            host: 'Bob',
            project: 'Forest',
            peers: '1/4',
            started: '1716968400',
          },
        },
      })
    })

    await it('parses a withdrawal line', async () => {
      const event = parseAvahiBrowseLine('-;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local')
      expect(event).toStrictEqual({ kind: 'gone', serviceName: 'Bob%27s Project' })
    })

    await it('returns null for announce-only `+` lines (we only act on resolved)', async () => {
      const event = parseAvahiBrowseLine('+;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local')
      expect(event).toBeNull()
    })

    await it('returns null for malformed / partial lines', async () => {
      expect(parseAvahiBrowseLine('')).toBeNull()
      expect(parseAvahiBrowseLine('garbage')).toBeNull()
      expect(parseAvahiBrowseLine('=;eth0;IPv4;name')).toBeNull()
      expect(parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;bad-port;""')).toBeNull()
      expect(parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;99999;""')).toBeNull()
    })

    await it('handles empty TXT', async () => {
      const event = parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;1234;')
      expect(event).toStrictEqual({
        kind: 'resolved',
        service: { name: 'n', host: 'h', address: 'a', port: 1234, txt: {} },
      })
    })

    await it('ignores TXT entries without `=`', async () => {
      const event = parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;1234;"valid=ok" "no-equals" "=no-key"')
      expect(event).toStrictEqual({
        kind: 'resolved',
        service: { name: 'n', host: 'h', address: 'a', port: 1234, txt: { valid: 'ok' } },
      })
    })
  })
}
