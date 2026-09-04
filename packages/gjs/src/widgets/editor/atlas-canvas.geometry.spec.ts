import { describe, expect, it } from '@gjsify/unit'

import {
  centeredScrollValue,
  clampPreviewZoom,
  sceneGeometry,
  type SceneBox,
  sceneRects,
  snapToGrid,
  surfaceSize,
  worldExtent,
} from './atlas-canvas.geometry.ts'

/** A sample-world scene: terrain rows decide its size. */
const terrain: SceneBox = { x: 10, y: 20, tilePx: 8, rows: ['....', '....', '....'] }

/** A real-project scene: no terrain, so the card geometry decides. */
const project: SceneBox = { x: 100, y: 0, tilePx: 4, rows: [], cols: 20, previewRows: 10 }

export default async () => {
  await describe('atlas-canvas.geometry', async () => {
    await describe('sceneGeometry', async () => {
      await it('measures a terrain scene from its rows', async () => {
        expect(sceneGeometry(terrain)).toStrictEqual({ w: 32, h: 24 })
      })

      await it('falls back to the card geometry without terrain', async () => {
        expect(sceneGeometry(project)).toStrictEqual({ w: 80, h: 40 })
      })

      await it('is zero for a scene with neither', async () => {
        expect(sceneGeometry({ x: 0, y: 0, tilePx: 8, rows: [] })).toStrictEqual({ w: 0, h: 0 })
      })
    })

    await describe('sceneRects', async () => {
      await it('carries each scene position through with its size', async () => {
        expect(sceneRects([terrain])).toStrictEqual([{ x: 10, y: 20, w: 32, h: 24 }])
      })
    })

    await describe('worldExtent', async () => {
      await it('unions every scene box', async () => {
        expect(worldExtent([terrain, project])).toStrictEqual({ width: 180, height: 44 })
      })

      await it('is zero for an empty world', async () => {
        expect(worldExtent([])).toStrictEqual({ width: 0, height: 0 })
      })
    })

    await describe('surfaceSize', async () => {
      await it('pads the world extent on both sides', async () => {
        expect(surfaceSize([terrain], 100)).toStrictEqual({ width: 242, height: 244 })
      })
    })

    await describe('snapToGrid', async () => {
      await it('rounds to the nearest step', async () => {
        expect(snapToGrid(11, 8)).toBe(8)
        expect(snapToGrid(13, 8)).toBe(16)
      })

      await it('never lands off the surface', async () => {
        expect(snapToGrid(-40, 8)).toBe(0)
      })
    })

    await describe('centeredScrollValue', async () => {
      await it('centres the world in the viewport', async () => {
        expect(centeredScrollValue(1000, 1200, 400)).toBe(300)
      })

      await it('clamps to the start when the world fits', async () => {
        expect(centeredScrollValue(200, 400, 400)).toBe(0)
      })

      await it('clamps to the end of the adjustment', async () => {
        expect(centeredScrollValue(4000, 1000, 400)).toBe(600)
      })
    })

    await describe('clampPreviewZoom', async () => {
      await it('passes a sane zoom through', async () => {
        expect(clampPreviewZoom(2)).toBe(2)
      })

      await it('clamps both ends', async () => {
        expect(clampPreviewZoom(0.1)).toBe(0.5)
        expect(clampPreviewZoom(99)).toBe(6)
      })
    })
  })
}
