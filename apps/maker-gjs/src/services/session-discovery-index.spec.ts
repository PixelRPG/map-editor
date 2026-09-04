import { describe, expect, it } from '@gjsify/unit'

import type { DiscoveredService } from './lan-discovery-parse.ts'
import { applyDiscoveryEvent, type DiscoveredByRoom } from './session-discovery-index.ts'

function service(name: string, room?: string, port = 8089): DiscoveredService {
  return { name, host: `${name}.local`, address: '127.0.0.1', port, txt: room ? { room } : {} }
}

export default async () => {
  await describe('applyDiscoveryEvent', async () => {
    await it('indexes a resolved service under its advertised room id', async () => {
      const index: DiscoveredByRoom = new Map()
      const outcome = applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'abc') })
      expect(outcome).toStrictEqual({ kind: 'discovered', service: service('bob', 'abc') })
      expect(index.get('abc')?.name).toBe('bob')
    })

    await it('still reports a service that advertises no room, without indexing it', async () => {
      const index: DiscoveredByRoom = new Map()
      const outcome = applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob') })
      expect(outcome.kind).toBe('discovered')
      expect(index.size).toBe(0)
    })

    await it('replaces an earlier entry when the same room re-resolves on a new port', async () => {
      const index: DiscoveredByRoom = new Map()
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'abc', 8089) })
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'abc', 9999) })
      expect(index.size).toBe(1)
      expect(index.get('abc')?.port).toBe(9999)
    })

    await it('evicts every room a departing service NAME owned', async () => {
      // `gone` carries a service name, not a room id — miss the walk and
      // a paste-link join dials a host that already left instead of
      // falling back to the relay.
      const index: DiscoveredByRoom = new Map()
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'abc') })
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'def') })
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('alice', 'ghi') })

      const outcome = applyDiscoveryEvent(index, { kind: 'gone', serviceName: 'bob' })

      expect(outcome).toStrictEqual({ kind: 'gone', serviceName: 'bob' })
      expect([...index.keys()]).toStrictEqual(['ghi'])
    })

    await it('leaves the index alone when an unknown service goes away', async () => {
      const index: DiscoveredByRoom = new Map()
      applyDiscoveryEvent(index, { kind: 'resolved', service: service('bob', 'abc') })
      applyDiscoveryEvent(index, { kind: 'gone', serviceName: 'nobody' })
      expect([...index.keys()]).toStrictEqual(['abc'])
    })
  })
}
