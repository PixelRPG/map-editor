import type { DiscoveredService, LanDiscoveryEvent } from './lan-discovery-parse.ts'

/**
 * Discovered LAN services keyed by their `txt.room` field — the room id
 * the host advertises. Lets `joinByRoomId` shortcut to the LAN path when
 * the same room is reachable on this network, skipping the relay (which
 * currently points at a placeholder `signalling.pixelrpg.example` and
 * would fail with `Gio.ResolverError`).
 */
export type DiscoveredByRoom = Map<string, DiscoveredService>

/** What the caller should re-emit after folding a discovery event in. */
export type DiscoveryOutcome =
  | { kind: 'discovered'; service: DiscoveredService }
  | { kind: 'gone'; serviceName: string }

/**
 * Fold one Avahi event into the room index and report what to emit.
 *
 * The asymmetry is the load-bearing part: a `resolved` event carries the
 * room id directly, but `gone` carries only a service NAME, so every
 * room entry pointing at that service has to be walked out. Missing that
 * eviction leaves a stale room → a paste-link join dials a host that has
 * left, instead of falling back to the relay.
 */
export function applyDiscoveryEvent(index: DiscoveredByRoom, event: LanDiscoveryEvent): DiscoveryOutcome {
  if (event.kind === 'resolved') {
    const room = event.service.txt.room
    if (room) index.set(room, event.service)
    return { kind: 'discovered', service: event.service }
  }
  for (const [room, service] of index) {
    if (service.name === event.serviceName) index.delete(room)
  }
  return { kind: 'gone', serviceName: event.serviceName }
}
