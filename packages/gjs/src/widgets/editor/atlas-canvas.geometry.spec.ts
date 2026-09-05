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

      await it('prefers terrain over a stale card geometry', async () => {
        expect(sceneGeometry({ x: 0, y: 0, tilePx: 8, rows: ['..'], cols: 99, previewRows: 99 })).toStrictEqual({
          w: 16,
          h: 8,
        })
      })

      await it('measures the FIRST row only — a ragged scene under-reports', async () => {
        expect(sceneGeometry({ x: 0, y: 0, tilePx: 8, rows: ['..', '.....'] })).toStrictEqual({ w: 16, h: 16 })
      })

      await it('falls back per axis when the first row is empty', async () => {
        expect(sceneGeometry({ x: 0, y: 0, tilePx: 4, rows: [''], cols: 5, previewRows: 9 })).toStrictEqual({
          w: 20,
          h: 4,
        })
      })

      await it('is zero-area for a zero tile size', async () => {
        expect(sceneGeometry({ x: 0, y: 0, tilePx: 0, rows: ['....'] })).toStrictEqual({ w: 0, h: 0 })
      })
    })

    await describe('sceneRects', async () => {
      await it('carries each scene position through with its size', async () => {
        expect(sceneRects([terrain])).toStrictEqual([{ x: 10, y: 20, w: 32, h: 24 }])
      })

      await it('is empty for an empty world', async () => {
        expect(sceneRects([])).toStrictEqual([])
      })

      await it('preserves scene order — the overview draws them in it', async () => {
        expect(sceneRects([project, terrain]).map((r) => r.x)).toStrictEqual([100, 10])
      })
    })

    await describe('worldExtent', async () => {
      await it('unions every scene box', async () => {
        expect(worldExtent([terrain, project])).toStrictEqual({ width: 180, height: 44 })
      })

      await it('is zero for an empty world', async () => {
        expect(worldExtent([])).toStrictEqual({ width: 0, height: 0 })
      })

      await it('measures the far edge of a single scene', async () => {
        expect(worldExtent([terrain])).toStrictEqual({ width: 42, height: 44 })
      })

      await it('never reports a negative extent for a scene left of the origin', async () => {
        // A card dragged past 0 in atlas space: the extent is the FAR
        // edge, so the surface never shrinks below the origin.
        expect(worldExtent([{ x: -100, y: -100, tilePx: 8, rows: ['..'] }])).toStrictEqual({ width: 0, height: 0 })
      })

      await it('is driven by the furthest scene, not the last one', async () => {
        expect(worldExtent([project, terrain]).width).toBe(180)
      })
    })

    await describe('surfaceSize', async () => {
      await it('pads the world extent on both sides', async () => {
        expect(surfaceSize([terrain], 100)).toStrictEqual({ width: 242, height: 244 })
      })

      await it('is exactly the extent with zero padding', async () => {
        expect(surfaceSize([terrain], 0)).toStrictEqual({ width: 42, height: 44 })
      })

      await it('is pure padding for an empty world', async () => {
        expect(surfaceSize([], 180)).toStrictEqual({ width: 360, height: 360 })
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

      await it('rounds a half-step UP', async () => {
        expect(snapToGrid(12, 8)).toBe(16)
      })

      await it('leaves an already-aligned value alone', async () => {
        expect(snapToGrid(64, 8)).toBe(64)
      })

      await it('clamps a small negative to the origin rather than -0', async () => {
        expect(snapToGrid(-1, 8)).toBe(0)
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

      await it('stays at 0 when the page is larger than the whole adjustment', async () => {
        // Pre-allocation / tiny window: `upper - pageSize` goes negative.
        expect(centeredScrollValue(4000, 300, 400)).toBe(0)
      })

      await it('stays at 0 before the first allocation (page size 0)', async () => {
        expect(centeredScrollValue(4000, 0, 0)).toBe(0)
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

      await it('keeps the bounds themselves', async () => {
        expect(clampPreviewZoom(0.5)).toBe(0.5)
        expect(clampPreviewZoom(6)).toBe(6)
      })

      await it('clamps a zero or negative zoom to the minimum', async () => {
        expect(clampPreviewZoom(0)).toBe(0.5)
        expect(clampPreviewZoom(-2)).toBe(0.5)
      })
    })
  })
}
