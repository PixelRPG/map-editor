/**
 * Pure `MapEditorData` patch helpers behind the map-persistence path.
 *
 * The contract under test is field preservation: `editorData` holds atlas
 * position, preview viewport, grid + camera and custom properties side by
 * side, so an atlas-position write must not clobber the preview (and vice
 * versa), and a preview write must MERGE into any existing preview rather
 * than replace it. These are the exact spots a naive `editorData = {...}`
 * write would silently drop sibling state.
 */

import { describe, expect, it } from '@gjsify/unit'

import { withAtlasPosition, withPreviewViewport } from './map-editor-data.ts'

export default async () => {
  await describe('withAtlasPosition', async () => {
    await it('sets atlas coordinates on empty editor-data', async () => {
      expect(withAtlasPosition(undefined, 12, 34)).toStrictEqual({ atlasX: 12, atlasY: 34 })
    })

    await it('preserves grid, camera, preview and properties', async () => {
      const existing = {
        grid: { visible: true, size: 16 },
        camera: { x: 1, y: 2, zoom: 2 },
        preview: { tileX: 5, tileY: 6 },
        properties: { foo: 'bar' },
      }
      expect(withAtlasPosition(existing, 99, 100)).toStrictEqual({
        grid: { visible: true, size: 16 },
        camera: { x: 1, y: 2, zoom: 2 },
        preview: { tileX: 5, tileY: 6 },
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

  await describe('withPreviewViewport', async () => {
    await it('sets the viewport on empty editor-data', async () => {
      expect(withPreviewViewport(undefined, 3, 4)).toStrictEqual({ preview: { tileX: 3, tileY: 4 } })
    })

    await it('preserves atlas position and grid while setting the viewport', async () => {
      const existing = { atlasX: 10, atlasY: 20, grid: { visible: false } }
      expect(withPreviewViewport(existing, 3, 4)).toStrictEqual({
        atlasX: 10,
        atlasY: 20,
        grid: { visible: false },
        preview: { tileX: 3, tileY: 4 },
      })
    })

    await it('merges into an existing preview record (does not replace it)', async () => {
      // A future preview key must survive a tileX/tileY-only update.
      const existing = { preview: { tileX: 1, tileY: 1, zoom: 3 } as Record<string, number> }
      expect(withPreviewViewport(existing, 9, 9)).toStrictEqual({ preview: { tileX: 9, tileY: 9, zoom: 3 } })
    })

    await it('does not mutate the input record', async () => {
      const input = { preview: { tileX: 1, tileY: 1 } }
      withPreviewViewport(input, 9, 9)
      expect(input).toStrictEqual({ preview: { tileX: 1, tileY: 1 } })
    })
  })
}
