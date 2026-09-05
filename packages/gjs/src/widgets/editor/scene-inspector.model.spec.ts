import { describe, expect, it } from '@gjsify/unit'

import {
  type InspectedScene,
  previewTilePx,
  type SceneLink,
  sceneStats,
  sceneSubtitleText,
  sceneTileSize,
  teleportSummaries,
} from './scene-inspector.model.ts'

const village: InspectedScene = { id: 'village', rows: ['....', '....'], music: 'overworld', events: 3, npcs: [1, 2] }
const cave: InspectedScene = { id: 'cave', rows: [], cols: 20, previewRows: 10, events: 0 }

const LINKS: SceneLink[] = [
  { from: 'village', to: 'cave', label: 'Cave mouth' },
  { from: 'cave', to: 'village', label: 'Back out' },
  { from: 'shop', to: 'village', label: 'Shop door' },
]

const SCENE_NAMES = [
  { id: 'village', name: 'Village' },
  { id: 'cave', name: 'Cave' },
]

export default async () => {
  await describe('scene-inspector.model', async () => {
    await describe('sceneTileSize', async () => {
      await it('measures a terrain scene from its rows', async () => {
        expect(sceneTileSize(village)).toStrictEqual({ cols: 4, rows: 2 })
      })

      await it('falls back to the card geometry without terrain', async () => {
        expect(sceneTileSize(cave)).toStrictEqual({ cols: 20, rows: 10 })
      })

      await it('is zero for a scene with neither terrain nor card geometry', async () => {
        expect(sceneTileSize({ id: 'x', rows: [], events: 0 })).toStrictEqual({ cols: 0, rows: 0 })
      })

      await it('reads the width off the FIRST row only (a ragged map under-reports)', async () => {
        expect(sceneTileSize({ id: 'x', rows: ['..', '.....'], events: 0 })).toStrictEqual({ cols: 2, rows: 2 })
      })

      await it('prefers terrain over a stale card geometry', async () => {
        expect(sceneTileSize({ id: 'x', rows: ['...'], cols: 99, previewRows: 99, events: 0 })).toStrictEqual({
          cols: 3,
          rows: 1,
        })
      })

      await it('falls back per axis — an empty first row still uses cols', async () => {
        expect(sceneTileSize({ id: 'x', rows: [''], cols: 7, previewRows: 9, events: 0 })).toStrictEqual({
          cols: 7,
          rows: 1,
        })
      })
    })

    await describe('sceneSubtitleText', async () => {
      await it('joins size and music', async () => {
        expect(sceneSubtitleText(village)).toBe('4×2 tiles · overworld')
      })

      await it('says so when the scene has no music', async () => {
        expect(sceneSubtitleText(cave)).toBe('20×10 tiles · no music')
      })
    })

    await describe('sceneStats', async () => {
      await it('counts npcs, events and both teleport directions', async () => {
        expect(sceneStats(village, LINKS)).toStrictEqual([
          { label: 'NPCs', value: '2' },
          { label: 'Events', value: '3' },
          { label: 'In', value: '2' },
          { label: 'Out', value: '1' },
        ])
      })

      await it('reports zeroes for a scene with nothing attached', async () => {
        expect(sceneStats(cave, [])).toStrictEqual([
          { label: 'NPCs', value: '0' },
          { label: 'Events', value: '0' },
          { label: 'In', value: '0' },
          { label: 'Out', value: '0' },
        ])
      })
    })

    await describe('teleportSummaries', async () => {
      await it('resolves the other end and its direction', async () => {
        expect(teleportSummaries(village, SCENE_NAMES, LINKS)).toStrictEqual([
          { label: 'Cave mouth', otherSceneId: 'cave', otherSceneName: 'Cave', direction: 'out' },
          { label: 'Back out', otherSceneId: 'cave', otherSceneName: 'Cave', direction: 'in' },
          { label: 'Shop door', otherSceneId: 'shop', otherSceneName: 'shop', direction: 'in' },
        ])
      })

      await it('skips teleports that do not touch the scene', async () => {
        expect(teleportSummaries(cave, SCENE_NAMES, [{ from: 'shop', to: 'village', label: 'x' }])).toStrictEqual([])
      })

      await it('lists a self-teleport ONCE, as outgoing', async () => {
        expect(
          teleportSummaries(village, SCENE_NAMES, [{ from: 'village', to: 'village', label: 'Loop' }]),
        ).toStrictEqual([{ label: 'Loop', otherSceneId: 'village', otherSceneName: 'Village', direction: 'out' }])
      })

      await it('is empty when there are no teleports at all', async () => {
        expect(teleportSummaries(village, SCENE_NAMES, [])).toStrictEqual([])
      })

      await it('falls back to the raw id when the other scene is unknown', async () => {
        expect(
          teleportSummaries(village, [], [{ from: 'village', to: 'ruins', label: 'Down' }])[0].otherSceneName,
        ).toBe('ruins')
      })
    })

    await describe('previewTilePx', async () => {
      await it('picks the limiting axis', async () => {
        expect(previewTilePx(20, 10, 240, 180)).toBe(12)
      })

      await it('never drops below one pixel', async () => {
        expect(previewTilePx(1000, 1000, 240, 180)).toBe(1)
      })

      await it('floors rather than rounds — the tile must fit', async () => {
        // 240 / 7 = 34.28…: 35 px would overflow the preview box.
        expect(previewTilePx(7, 1, 240, 1000)).toBe(34)
      })

      await it('returns 1 instead of Infinity for a zero-size map', async () => {
        // `sceneTileSize` yields 0x0 for a scene with neither terrain nor
        // card geometry; an infinite tile size reaches MiniMap as NaN.
        expect(previewTilePx(0, 0, 240, 180)).toBe(1)
        expect(previewTilePx(0, 10, 240, 180)).toBe(1)
        expect(previewTilePx(10, 0, 240, 180)).toBe(1)
      })

      await it('returns 1 for a negative map size', async () => {
        expect(previewTilePx(-4, 4, 240, 180)).toBe(1)
      })
    })
  })
}
