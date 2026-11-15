/**
 * Pure `MapEditorData` patch helpers behind the map-persistence path.
 *
 * The contract under test is field preservation: `editorData` holds atlas
 * position, grid + camera and custom properties side by side, so an
 * atlas-position write must not clobber any of them. This is the exact
 * spot a naive `editorData = {...}` write would silently drop sibling
 * state.
 */

import { describe, expect, it } from '@gjsify/unit'

import { withAtlasPosition } from './map-editor-data.ts'

export default async () => {
  await describe('withAtlasPosition', async () => {
    await it('sets atlas coordinates on empty editor-data', async () => {
      expect(withAtlasPosition(undefined, 12, 34)).toStrictEqual({ atlasX: 12, atlasY: 34 })
    })

    await it('preserves grid, camera and properties', async () => {
      const existing = {
        grid: { visible: true, size: 16 },
        camera: { x: 1, y: 2, zoom: 2 },
        properties: { foo: 'bar' },
      }
      expect(withAtlasPosition(existing, 99, 100)).toStrictEqual({
        grid: { visible: true, size: 16 },
        camera: { x: 1, y: 2, zoom: 2 },
        properties: { foo: 'bar' },
        atlasX: 99,
        atlasY: 100,
      })
    })

    await it('overwrites prior atlas coordinates', async () => {
      expect(withAtlasPosition({ atlasX: 1, atlasY: 1 }, 7, 8)).toStrictEqual({ atlasX: 7, atlasY: 8 })
    })

    await it('does not mutate the input record', async () => {
      const input = { atlasX: 1, atlasY: 1 }
      withAtlasPosition(input, 7, 8)
      expect(input).toStrictEqual({ atlasX: 1, atlasY: 1 })
    })
  })
}
