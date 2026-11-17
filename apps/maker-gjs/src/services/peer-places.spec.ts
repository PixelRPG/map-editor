import { describe, expect, it } from '@gjsify/unit'
import type { AwarenessPlace } from '@pixelrpg/engine'
import type { CollaboratorEntry } from '@pixelrpg/gjs'

import { buildPlaceMarkers, describePlace, markersAt, markersIn } from './peer-places.ts'

function peer(peerId: string, name: string, color: string, isAI = false): CollaboratorEntry {
  return { peerId, name, color, isAI }
}

const LABELS = { world: 'World', library: 'Library', game: 'Play', map: 'A map', welcome: 'Start' }

export default async () => {
  await describe('buildPlaceMarkers', async () => {
    await it('groups the roster by view and thing, in roster order', async () => {
      const places = new Map<string, AwarenessPlace>([
        ['ai', { view: 'map', id: 'forest' }],
        ['mia', { view: 'map', id: 'forest' }],
        ['sam', { view: 'library', id: 'link' }],
        ['kim', { view: 'world' }],
      ])
      const markers = buildPlaceMarkers(
        [
          peer('ai', 'Assistant', '#9141ac', true),
          peer('mia', 'Mia', '#1c71d8'),
          peer('sam', 'Sam', '#33d17a'),
          peer('kim', 'Kim', '#e66100'),
        ],
        places,
      )
      expect(markersAt(markers, 'map', 'forest').map((m) => m.peerId)).toStrictEqual(['ai', 'mia'])
      expect(markersAt(markers, 'map', 'forest')[0]?.isAI).toBe(true)
      expect(markersAt(markers, 'library', 'link').map((m) => m.name)).toStrictEqual(['Sam'])
      expect(markersIn(markers, 'map').size).toBe(1)
      // A view with nothing open files its people under the empty id.
      expect(markersAt(markers, 'world').map((m) => m.name)).toStrictEqual(['Kim'])
    })

    await it('answers "nobody" for a view or thing with no one on it', async () => {
      const markers = buildPlaceMarkers([peer('mia', 'Mia', '#1c71d8')], new Map([['mia', { view: 'world' }]]))
      expect(markersAt(markers, 'map', 'forest').length).toBe(0)
      expect(markersIn(markers, 'game').size).toBe(0)
      // The bare-view bucket must not answer for a real id, or every
      // card in a view would light up when one peer is merely in it.
      expect(markersAt(markers, 'world', 'forest').length).toBe(0)
    })

    await it('leaves out a participant whose place we have not been told', async () => {
      // A peer who joined and has not navigated yet is NOT on the start
      // map — painting them there would be a guess the user reads as fact.
      const markers = buildPlaceMarkers([peer('mia', 'Mia', '#1c71d8')], new Map())
      expect(markers.size).toBe(0)
    })

    await it('is empty for an empty roster', async () => {
      const markers = buildPlaceMarkers([], new Map([['ghost', { view: 'map', id: 'forest' }]]))
      expect(markers.size).toBe(0)
    })
  })

  await describe('describePlace', async () => {
    const mapNameOf = (id: string) => (id === 'forest' ? 'Kokiri Forest' : null)

    await it('names the map a peer is editing', async () => {
      expect(describePlace({ view: 'map', id: 'forest' }, mapNameOf, LABELS)).toBe('Kokiri Forest')
    })

    await it('falls back to the view label for a map we cannot name', async () => {
      // A joiner can be on a map whose project data has not arrived yet.
      expect(describePlace({ view: 'map', id: 'unknown' }, mapNameOf, LABELS)).toBe('A map')
    })

    await it('labels the other views rather than resolving their ids', async () => {
      expect(describePlace({ view: 'library', id: 'link' }, mapNameOf, LABELS)).toBe('Library')
      expect(describePlace({ view: 'world' }, mapNameOf, LABELS)).toBe('World')
      expect(describePlace({ view: 'game' }, mapNameOf, LABELS)).toBe('Play')
    })

    await it('has nothing to say about no place or an unknown view', async () => {
      expect(describePlace(undefined, mapNameOf, LABELS)).toBe(null)
      // The wire is version-tolerant: a newer peer's destination is not
      // an error, it is just a place this build cannot name.
      expect(describePlace({ view: 'sound-studio' }, mapNameOf, LABELS)).toBe(null)
    })
  })
}
