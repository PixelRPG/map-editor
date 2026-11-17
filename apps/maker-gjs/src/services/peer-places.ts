import type { AwarenessPlace } from '@pixelrpg/engine'
import type { CollaboratorEntry, PeerMarker } from '@pixelrpg/gjs'

export type { PeerMarker }

/**
 * Who is where: router destination → thing id → the people on it.
 *
 * Nested rather than one flat `view:id` key because every consumer
 * wants a whole view at once — the atlas hands `markersIn('map')`
 * straight to its cards, which know their scene id and nothing about
 * the awareness vocabulary. A place with no id (the World overview, the
 * Play tab) sits under {@link NO_PLACE_ID}.
 */
export type PlaceMarkers = ReadonlyMap<string, ReadonlyMap<string, readonly PeerMarker[]>>

/** The id a place without one is filed under. Never a real id. */
export const NO_PLACE_ID = ''

const NO_MARKERS: readonly PeerMarker[] = []
const NO_VIEW: ReadonlyMap<string, readonly PeerMarker[]> = new Map()

/**
 * Group the roster by where each person is, in roster order.
 *
 * `participants` carries identity (name, colour, AI flag) and `places`
 * carries location, because the two arrive on different schedules: the
 * roster is rebuilt on join/leave, the place changes on every
 * navigation. A participant with no entry in `places` is simply
 * somewhere we have not been told about and gets no dot — guessing
 * "probably the start map" would paint a peer onto a card they have
 * never opened.
 */
export function buildPlaceMarkers(
  participants: readonly CollaboratorEntry[],
  places: ReadonlyMap<string, AwarenessPlace>,
): PlaceMarkers {
  const byView = new Map<string, Map<string, PeerMarker[]>>()
  for (const participant of participants) {
    const place = places.get(participant.peerId)
    if (!place) continue
    let byId = byView.get(place.view)
    if (!byId) {
      byId = new Map()
      byView.set(place.view, byId)
    }
    const id = place.id || NO_PLACE_ID
    const list = byId.get(id)
    const marker: PeerMarker = {
      peerId: participant.peerId,
      name: participant.name,
      color: participant.color,
      isAI: participant.isAI,
    }
    if (list) list.push(marker)
    else byId.set(id, [marker])
  }
  return byView
}

/** Everyone in `view`, keyed by the id of the thing they have open. */
export function markersIn(markers: PlaceMarkers, view: string): ReadonlyMap<string, readonly PeerMarker[]> {
  return markers.get(view) ?? NO_VIEW
}

/** Everyone on one exact thing. */
export function markersAt(markers: PlaceMarkers, view: string, id?: string | null): readonly PeerMarker[] {
  return markersIn(markers, view).get(id || NO_PLACE_ID) ?? NO_MARKERS
}

/**
 * The human sentence for a place — the subtitle under a Together row.
 *
 * Only `map` resolves an id to a name: a map is a place in the game the
 * user named themselves ("Kokiri Forest"), while `library`'s id is a
 * character or a tileset in one of three id namespaces, and a row
 * reading "Library" already answers the question Together asks ("where
 * is Mia?"). `labels` is passed in rather than translated here so this
 * module stays gi-free and unit-testable.
 */
export function describePlace(
  place: AwarenessPlace | undefined,
  mapNameOf: (sceneId: string) => string | null,
  labels: Readonly<Record<string, string>>,
): string | null {
  if (!place) return null
  if (place.view === 'map') {
    const name = place.id ? mapNameOf(place.id) : null
    return name ?? labels[place.view] ?? null
  }
  return labels[place.view] ?? null
}
