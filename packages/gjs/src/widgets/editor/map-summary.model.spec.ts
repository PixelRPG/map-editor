import { describe, expect, it } from '@gjsify/unit'

import {
  joinDetails,
  mapSelectionFacts,
  previewTilePx,
  type SceneLink,
  sceneTileSize,
  type SummarizedScene,
  teleportSummaries,
} from './map-summary.model.ts'

const village: SummarizedScene = { id: 'village', rows: ['....', '....'], events: 3, npcs: [1, 2] }
const cave: SummarizedScene = { id: 'cave', rows: [], cols: 20, previewRows: 10, events: 0 }

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
  await describe('map-summary.model', async () => {
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

    await describe('mapSelectionFacts', async () => {
      await it('reports size, doors and things', async () => {
        expect(mapSelectionFacts(village, LINKS)).toStrictEqual({
          cols: 4,
          rows: 2,
          doors: 3,
          doorsNowhere: 0,
          things: 5,
        })
      })

      await it('is all zeroes for an empty scene without links', async () => {
        expect(mapSelectionFacts(cave, [])).toStrictEqual({
          cols: 20,
          rows: 10,
          doors: 0,
          doorsNowhere: 0,
          things: 0,
        })
      })

      await it('counts a door that goes nowhere as a door AND as nowhere', async () => {
        const facts = mapSelectionFacts(village, [...LINKS, { from: 'village', to: null, label: 'Shed' }])
        expect(facts.doors).toBe(4)
        expect(facts.doorsNowhere).toBe(1)
      })

      await it("leaves a broken door out of the other maps' facts", async () => {
        // A `null` target belongs to its SOURCE map only: there is no
        // other end that could claim it.
        expect(mapSelectionFacts(cave, [{ from: 'village', to: null, label: 'Shed' }])).toStrictEqual({
          cols: 20,
          rows: 10,
          doors: 0,
          doorsNowhere: 0,
          things: 0,
        })
      })

      await it('counts a self-teleport as ONE door, like the door list', async () => {
        const facts = mapSelectionFacts(village, [{ from: 'village', to: 'village', label: 'Loop' }])
        expect(facts.doors).toBe(1)
      })

      await it('counts npcs and events together', async () => {
        expect(mapSelectionFacts({ id: 'x', rows: [], events: 4, npcs: [1, 2, 3] }, []).things).toBe(7)
      })
    })

    await describe('joinDetails', async () => {
      await it('joins with the middle dot', async () => {
        expect(joinDetails(['176 × 148', '2 doors'])).toBe('176 × 148 · 2 doors')
      })

      await it('drops empty fragments instead of leaving a dangling dot', async () => {
        expect(joinDetails(['176 × 148', ''])).toBe('176 × 148')
        expect(joinDetails(['', '2 doors'])).toBe('2 doors')
      })

      await it('is empty for nothing at all', async () => {
        expect(joinDetails([])).toBe('')
        expect(joinDetails(['', ''])).toBe('')
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

      await it('reports a door that goes nowhere with no other end', async () => {
        // No id to resolve and no name to invent: the caller owns the
        // translated wording for "goes nowhere".
        expect(teleportSummaries(village, SCENE_NAMES, [{ from: 'village', to: null, label: 'Shed' }])).toStrictEqual([
          { label: 'Shed', otherSceneId: null, otherSceneName: '', direction: 'out' },
        ])
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
