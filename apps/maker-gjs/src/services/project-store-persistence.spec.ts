import GLib from '@girs/glib-2.0'
import { describe, expect, it } from '@gjsify/unit'
import { type GameProjectData, GameProjectFormat, type MapData, MapFormat, type SpriteSetData } from '@pixelrpg/engine'

import {
  deleteMapFile,
  deleteSpriteSetFiles,
  isPlainFilename,
  mapPaths,
  type ProjectStoreIo,
  spriteSetPaths,
  writeMapData,
  writeProjectData,
  writeSpriteSetDescriptor,
} from './project-store-persistence.ts'

/** GLib path helpers are only real under the GJS target; node stubs `gi://`. */
const hasGLibPaths = typeof (GLib as { path_get_dirname?: unknown }).path_get_dirname === 'function'

/** Recording IO fake — nothing touches the disk. */
function makeIo(ok = true) {
  const writes: Array<{ path: string; contents: string }> = []
  const removed: string[] = []
  const io: ProjectStoreIo & { writes: typeof writes; removed: string[] } = {
    writes,
    removed,
    writeText: (path, contents) => {
      writes.push({ path, contents })
      return ok
    },
    writeBinary: () => ok,
    copy: () => ok,
    readBinary: () => null,
    remove: (path) => {
      removed.push(path)
      return ok
    },
  }
  return io
}

const projectData = (overrides: Partial<GameProjectData> = {}): GameProjectData =>
  ({
    version: '1',
    id: 'test-project',
    name: 'Test Project',
    startup: { initialMapId: 'map-1' },
    maps: [{ id: 'map-1', path: './maps/map-1.json', type: 'map' }],
    spriteSets: [],
    ...overrides,
  }) as GameProjectData

const descriptor = {
  version: '1.0.0',
  id: 'tiles',
  name: 'Tiles',
  image: { id: 'main', type: 'image', path: 'tiles.png' },
  spriteWidth: 16,
  spriteHeight: 16,
  columns: 1,
  rows: 1,
  sprites: [{ id: 0, col: 0, row: 0 }],
} as unknown as SpriteSetData

const mapData = (overrides: Partial<MapData> = {}): MapData =>
  ({
    id: 'map-2',
    name: 'Map 2',
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: 20,
    rows: 14,
    spriteSets: [],
    layers: [{ id: 'layer_0', name: 'Background', visible: true, sprites: [] }],
    ...overrides,
  }) as MapData

export default async () => {
  await describe('isPlainFilename', async () => {
    await it('accepts a single path segment', async () => {
      expect(isPlainFilename('hero')).toBe(true)
      expect(isPlainFilename('hero-2')).toBe(true)
      expect(isPlainFilename('hero.png')).toBe(true)
    })

    await it('rejects everything a peer could use to escape spritesets/', async () => {
      expect(isPlainFilename('')).toBe(false)
      expect(isPlainFilename('..')).toBe(false)
      expect(isPlainFilename('../../etc/passwd')).toBe(false)
      expect(isPlainFilename('sub/dir')).toBe(false)
      expect(isPlainFilename('back\\slash')).toBe(false)
      expect(isPlainFilename('nul\0byte')).toBe(false)
      // `..` anywhere, not just as a leading segment.
      expect(isPlainFilename('he..ro')).toBe(false)
    })
  })

  await describe('spriteSetPaths', async () => {
    await it('places both files in the project sibling spritesets/ directory', async () => {
      if (!hasGLibPaths) return
      const paths = spriteSetPaths('/tmp/proj/game-project.json', 'hero')
      expect(paths.imageFile).toBe('hero.png')
      expect(paths.image).toBe('/tmp/proj/spritesets/hero.png')
      expect(paths.descriptor).toBe('/tmp/proj/spritesets/hero.json')
    })
  })

  await describe('writeProjectData', async () => {
    await it('serialises through the project format and reports the write result', async () => {
      const io = makeIo()
      expect(writeProjectData(io, '/tmp/proj/game-project.json', projectData())).toBe(true)
      expect(io.writes).toHaveLength(1)
      expect(io.writes[0].path).toBe('/tmp/proj/game-project.json')
      expect(GameProjectFormat.deserialize(io.writes[0].contents).id).toBe('test-project')
    })

    await it('reports a failed write instead of throwing', async () => {
      const io = makeIo(false)
      expect(writeProjectData(io, '/tmp/proj/game-project.json', projectData())).toBe(false)
    })

    await it('swallows a validation throw so a bad in-memory project cannot crash the editor', async () => {
      const io = makeIo()
      // `GameProjectFormat.serialize` validates and throws — the store's
      // policy is "toast, keep the in-memory state", never propagate.
      expect(writeProjectData(io, '/tmp/proj/game-project.json', projectData({ name: '' }))).toBe(false)
      expect(io.writes).toHaveLength(0)
    })
  })

  await describe('writeSpriteSetDescriptor', async () => {
    await it('serialises the descriptor to the given path', async () => {
      const io = makeIo()
      expect(writeSpriteSetDescriptor(io, '/tmp/proj/spritesets/tiles.json', descriptor)).toBe(true)
      expect(io.writes[0].path).toBe('/tmp/proj/spritesets/tiles.json')
      expect(JSON.parse(io.writes[0].contents).id).toBe('tiles')
    })
  })

  await describe('deleteSpriteSetFiles', async () => {
    await it('removes both the image and the descriptor', async () => {
      const io = makeIo()
      deleteSpriteSetFiles(io, {
        imageFile: 'tiles.png',
        image: '/tmp/proj/spritesets/tiles.png',
        descriptor: '/tmp/proj/spritesets/tiles.json',
      })
      expect(io.removed).toStrictEqual(['/tmp/proj/spritesets/tiles.png', '/tmp/proj/spritesets/tiles.json'])
    })
  })

  await describe('mapPaths', async () => {
    await it('places the file in the project sibling maps/ directory', async () => {
      if (!hasGLibPaths) return
      const paths = mapPaths('/tmp/proj/game-project.json', 'cave')
      expect(paths.referencePath).toBe('./maps/cave.json')
      expect(paths.file).toBe('/tmp/proj/maps/cave.json')
    })
  })

  await describe('writeMapData', async () => {
    await it('serialises through the map format and reports the write result', async () => {
      const io = makeIo()
      expect(writeMapData(io, '/tmp/proj/maps/map-2.json', mapData())).toBe(true)
      expect(io.writes).toHaveLength(1)
      expect(io.writes[0].path).toBe('/tmp/proj/maps/map-2.json')
      expect(MapFormat.deserialize(io.writes[0].contents).id).toBe('map-2')
    })

    await it('reports a failed write instead of throwing', async () => {
      const io = makeIo(false)
      expect(writeMapData(io, '/tmp/proj/maps/map-2.json', mapData())).toBe(false)
    })

    await it('swallows a validation throw so an unsavable map is never registered', async () => {
      const io = makeIo()
      // The create path writes BEFORE it touches `game-project.json`, so
      // `false` here is what keeps a broken map out of the project.
      expect(writeMapData(io, '/tmp/proj/maps/map-2.json', mapData({ layers: [] }))).toBe(false)
      expect(io.writes).toHaveLength(0)
    })
  })

  await describe('deleteMapFile', async () => {
    await it('removes the map json', async () => {
      const io = makeIo()
      deleteMapFile(io, { referencePath: './maps/cave.json', file: '/tmp/proj/maps/cave.json' })
      expect(io.removed).toStrictEqual(['/tmp/proj/maps/cave.json'])
    })
  })
}
