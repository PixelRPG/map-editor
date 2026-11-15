import { describe, expect, it } from '@gjsify/unit'

import { type AtlasCameraMap, parseAtlasCameras, withAtlasCamera } from './atlas-camera-store.ts'

const camera = (zoom: number) => ({ zoom, scrollX: zoom * 10, scrollY: zoom * 20 })

export default async () => {
  await describe('parseAtlasCameras', async () => {
    await it('keeps well-formed entries', async () => {
      const cameras = parseAtlasCameras(
        JSON.stringify({ '/a/game-project.json': camera(0.5), '/b/game-project.json': camera(2) }),
      )
      expect(cameras['/a/game-project.json']).toStrictEqual({ zoom: 0.5, scrollX: 5, scrollY: 10 })
      expect(cameras['/b/game-project.json']).toStrictEqual({ zoom: 2, scrollX: 20, scrollY: 40 })
    })

    await it('drops partial and non-numeric cameras', async () => {
      const cameras = parseAtlasCameras(
        JSON.stringify({
          '/partial.json': { zoom: 1, scrollX: 0 },
          '/string.json': { zoom: '1', scrollX: 0, scrollY: 0 },
          '/null.json': null,
          '/good.json': camera(1),
        }),
      )
      expect(Object.keys(cameras)).toStrictEqual(['/good.json'])
    })

    await it('drops a camera whose numbers are not finite', async () => {
      // `JSON.stringify` writes NaN and Infinity as `null`, so a camera
      // saved from a broken layout pass comes back null-valued. Such a
      // zoom would make every layout computation produce NaN rects and
      // leave the atlas blank with no hint why — refusing the entry
      // costs one Fit instead.
      expect(parseAtlasCameras('{"/a.json":{"zoom":null,"scrollX":0,"scrollY":0}}')).toStrictEqual({})
      expect(parseAtlasCameras(JSON.stringify({ '/b.json': { zoom: NaN, scrollX: 0, scrollY: 0 } }))).toStrictEqual({})
    })

    await it('ignores extra keys on an otherwise valid camera', async () => {
      const cameras = parseAtlasCameras('{"/a.json":{"zoom":1,"scrollX":2,"scrollY":3,"legacy":true}}')
      expect(cameras['/a.json']).toStrictEqual({ zoom: 1, scrollX: 2, scrollY: 3 })
    })

    await it('returns an empty map for an array, a scalar or junk', async () => {
      expect(parseAtlasCameras('[]')).toStrictEqual({})
      expect(parseAtlasCameras('7')).toStrictEqual({})
      expect(parseAtlasCameras('not json')).toStrictEqual({})
    })
  })

  await describe('withAtlasCamera', async () => {
    await it('adds a camera for a new project', async () => {
      const cameras = withAtlasCamera({}, '/a.json', camera(1))
      expect(cameras).toStrictEqual({ '/a.json': { zoom: 1, scrollX: 10, scrollY: 20 } })
    })

    await it('replaces the camera of a known project', async () => {
      const first = withAtlasCamera({}, '/a.json', camera(1))
      const second = withAtlasCamera(first, '/a.json', camera(2))
      expect(Object.keys(second)).toStrictEqual(['/a.json'])
      expect(second['/a.json'].zoom).toBe(2)
    })

    await it('leaves the input map untouched', async () => {
      const before: AtlasCameraMap = { '/a.json': camera(1) }
      withAtlasCamera(before, '/b.json', camera(2))
      expect(Object.keys(before)).toStrictEqual(['/a.json'])
    })

    await it('caps the store at 32 projects, evicting the oldest', async () => {
      let cameras: AtlasCameraMap = {}
      for (let i = 0; i < 40; i++) cameras = withAtlasCamera(cameras, `/p${i}.json`, camera(1))
      expect(Object.keys(cameras).length).toBe(32)
      expect(cameras['/p7.json']).toBe(undefined)
      expect(cameras['/p8.json']).not.toBe(undefined)
      expect(cameras['/p39.json']).not.toBe(undefined)
    })

    await it('re-saving a project protects it from eviction', async () => {
      let cameras: AtlasCameraMap = {}
      for (let i = 0; i < 32; i++) cameras = withAtlasCamera(cameras, `/p${i}.json`, camera(1))
      // /p0 is next in line to be evicted — looking at it again should
      // move it to the back of the queue, so the following insert drops
      // /p1 instead.
      cameras = withAtlasCamera(cameras, '/p0.json', camera(3))
      cameras = withAtlasCamera(cameras, '/new.json', camera(1))
      expect(cameras['/p0.json'].zoom).toBe(3)
      expect(cameras['/p1.json']).toBe(undefined)
    })
  })
}
