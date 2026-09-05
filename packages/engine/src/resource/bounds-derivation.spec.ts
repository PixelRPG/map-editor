/**
 * Pins the direction of the bounds derivation.
 *
 * The editor has two edit paths — the pointer path
 * (`TileEditorSystem`) and the programmatic one (`EditOperations`,
 * driven over D-Bus/MCP) — and each bounds-checks its coordinates.
 * They used to read the extent from DIFFERENT places: the pointer path
 * from the scene's `TileMap`, the programmatic object stamp from
 * `MapData.columns/rows`. They agreed, which is exactly why nobody
 * noticed the programmatic paint path had no bounds check at all for a
 * while — two checks that agree by coincidence are one bug away from
 * disagreeing.
 *
 * The resolution: `MapData.columns/rows` is the PERSISTED truth and the
 * tilemaps are derived from it. This spec asserts that derivation, so
 * the choice of authority is a measured fact rather than a comment. If
 * a future resize path ever writes tilemap dimensions without writing
 * the map data, this fails.
 */

import { describe, expect, it } from '@gjsify/unit'

import { isTileOutsideMap } from '../services/tile-edit-target.ts'
import { LAYER_PLANES } from '../types/data/LayerData.ts'
import type { MapData } from '../types/data/index.ts'
import { buildPlaneTileMaps } from './tilemap-builder.ts'

function makeMapData(columns: number, rows: number): MapData {
  return {
    id: 'm1',
    name: 'Bounds',
    version: '1',
    tileWidth: 16,
    tileHeight: 16,
    columns,
    rows,
    layers: [],
  } as unknown as MapData
}

export default async () => {
  await describe('map bounds — one authority', async () => {
    await it('derives every plane tilemap from MapData.columns/rows', async () => {
      const mapData = makeMapData(7, 5)
      const byPlane = buildPlaneTileMaps(mapData)
      expect([...byPlane.keys()].sort()).toStrictEqual([...LAYER_PLANES].sort())
      for (const plane of LAYER_PLANES) {
        const tilemap = byPlane.get(plane)
        expect(tilemap?.columns).toBe(mapData.columns)
        expect(tilemap?.rows).toBe(mapData.rows)
      }
    })

    await it('a tilemap built from other numbers disagrees — which is why it is not the authority', async () => {
      // The negative control for the assertion above: if the derivation
      // is ever bypassed, the two sources give different verdicts for
      // the SAME tile, and the persisted one is the one to trust.
      const mapData = makeMapData(4, 4)
      const oversizedMirror = { columns: 8, rows: 8 }
      expect(isTileOutsideMap(mapData, 6, 6)).toBe(true)
      expect(isTileOutsideMap(oversizedMirror, 6, 6)).toBe(false)
    })
  })
}
