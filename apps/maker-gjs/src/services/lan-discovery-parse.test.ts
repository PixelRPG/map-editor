import { describe, expect, it } from 'vitest'

import { parseAvahiBrowseLine } from './lan-discovery-parse.ts'

describe('parseAvahiBrowseLine', () => {
  it('parses a resolution line with TXT records', () => {
    const event = parseAvahiBrowseLine(
      '=;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local;bob.local;192.168.1.42;8088;' +
        '"version=1" "kind=edit" "room=a3f2-bb91" "host=Bob" "project=Forest" "peers=1/4" "started=1716968400"',
    )
    expect(event).toEqual({
      kind: 'resolved',
      service: {
        name: "Bob%27s Project",
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

  it('parses a withdrawal line', () => {
    const event = parseAvahiBrowseLine('-;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local')
    expect(event).toEqual({ kind: 'gone', serviceName: "Bob%27s Project" })
  })

  it('returns null for announce-only `+` lines (we only act on resolved)', () => {
    const event = parseAvahiBrowseLine('+;eth0;IPv4;Bob%27s Project;_pixelrpg._tcp;local')
    expect(event).toBeNull()
  })

  it('returns null for malformed / partial lines', () => {
    expect(parseAvahiBrowseLine('')).toBeNull()
    expect(parseAvahiBrowseLine('garbage')).toBeNull()
    expect(parseAvahiBrowseLine('=;eth0;IPv4;name')).toBeNull() // too few fields
    expect(parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;bad-port;""')).toBeNull()
    expect(parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;99999;""')).toBeNull() // port out of range
  })

  it('handles empty TXT', () => {
    const event = parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;1234;')
    expect(event).toEqual({
      kind: 'resolved',
      service: { name: 'n', host: 'h', address: 'a', port: 1234, txt: {} },
    })
  })

  it('ignores TXT entries without `=`', () => {
    const event = parseAvahiBrowseLine('=;eth0;IPv4;n;t;d;h;a;1234;"valid=ok" "no-equals" "=no-key"')
    expect(event).toEqual({
      kind: 'resolved',
      service: { name: 'n', host: 'h', address: 'a', port: 1234, txt: { valid: 'ok' } },
    })
  })
})
