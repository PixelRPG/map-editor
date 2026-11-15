import { describe, expect, it } from '@gjsify/unit'

import { rectExtent, sceneGeometry, type SceneBox, sceneRects, snapToGrid } from './atlas-canvas.geometry.ts'

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

    await describe('rectExtent', async () => {
      await it('unions a set of rects', async () => {
        expect(
          rectExtent([
            { x: 0, y: 0, w: 10, h: 40 },
            { x: 30, y: 5, w: 10, h: 10 },
          ]),
        ).toStrictEqual({ width: 40, height: 40 })
      })

      await it('is zero for no rects', async () => {
        expect(rectExtent([])).toStrictEqual({ width: 0, height: 0 })
      })

      await it('never reports a negative extent', async () => {
        expect(rectExtent([{ x: -100, y: -100, w: 16, h: 8 }])).toStrictEqual({ width: 0, height: 0 })
      })

      await it('measures the atlas world through sceneRects', async () => {
        // A card dragged past 0 in atlas space counts as the FAR edge
        // only, so the surface never shrinks below the origin.
        expect(rectExtent(sceneRects([terrain, project]))).toStrictEqual({ width: 180, height: 44 })
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
  })
}
