import { describe, expect, it } from '@gjsify/unit'
import type { SampleScene, SampleTeleport } from '@pixelrpg/gjs'

import { mapDetails, mapRows, rowIndexOf } from './map-sidebar.model.ts'

const scene = (id: string, name: string, events = 0): SampleScene => ({
  id,
  name,
  rows: ['..', '..'],
  x: 0,
  y: 0,
  tilePx: 4,
  events,
})

const door = (from: string, to: string | null): SampleTeleport => ({
  from,
  fx: 0,
  fy: 0,
  to,
  tx: 0,
  ty: 0,
  label: 'Door',
  placementId: `${from}-${to}`,
})

const scenes = [scene('a', 'Cliffs', 2), scene('b', 'Cave')]
const teleports = [door('a', 'b'), door('b', null)]

export default async () => {
  await describe('map sidebar model', async () => {
    await it('lists maps in world order and flags the start map', async () => {
      const rows = mapRows(scenes, teleports, 'b')
      expect(rows.map((r) => r.id).join(',')).toBe('a,b')
      expect(rows[0].isStart).toBe(false)
      expect(rows[1].isStart).toBe(true)
      expect(rows[0].facts.things).toBe(2)
    })

    await it('flags no start map when none is set', async () => {
      expect(mapRows(scenes, teleports, null).some((r) => r.isStart)).toBe(false)
    })

    await it('describes the selected map with its doors', async () => {
      const details = mapDetails(scenes, teleports, 'b')
      expect(details?.name).toBe('Cave')
      expect(details?.doors.length).toBe(2)
      expect(details?.facts.doorsNowhere).toBe(1)
    })

    await it('names the map and placement each door lives on', async () => {
      const doors = mapDetails(scenes, teleports, 'b')?.doors ?? []
      expect(doors[0].ownerMapId).toBe('a')
      expect(doors[0].direction).toBe('in')
      expect(doors[1].ownerMapId).toBe('b')
      expect(doors[1].placementId).toBe('b-null')
    })

    await it('has no details for nothing or an unknown map', async () => {
      expect(mapDetails(scenes, teleports, null)).toBe(null)
      expect(mapDetails(scenes, teleports, 'zzz')).toBe(null)
    })

    await it('finds the row index of a map', async () => {
      const rows = mapRows(scenes, teleports, null)
      expect(rowIndexOf(rows, 'b')).toBe(1)
      expect(rowIndexOf(rows, 'zzz')).toBe(-1)
      expect(rowIndexOf(rows, null)).toBe(-1)
    })
  })
}
