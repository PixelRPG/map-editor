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
    })

    await describe('previewTilePx', async () => {
      await it('picks the limiting axis', async () => {
        expect(previewTilePx(20, 10, 240, 180)).toBe(12)
      })

      await it('never drops below one pixel', async () => {
        expect(previewTilePx(1000, 1000, 240, 180)).toBe(1)
      })
    })
  })
}
