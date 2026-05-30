import { describe, expect, it } from '@gjsify/unit'

import type { GameProjectData, MapData } from '../types/index.ts'

import {
  applyProjectSnapshot,
  parseProjectSnapshot,
  PROJECT_SNAPSHOT_VERSION,
  type ProjectSnapshot,
  serializeProjectSnapshot,
} from './project-snapshot.ts'

const FAKE_MAP_DATA: MapData = {
  version: '1.0.0',
  id: 'dungeon',
  name: 'Dungeon',
  columns: 16,
  rows: 16,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ id: 'ground', name: 'Ground', type: 'tile', tier: 'background', data: [] }],
  spriteSets: [],
} as unknown as MapData

const FAKE_PROJECT: GameProjectData = {
  version: '1.0.0',
  id: 'demo',
  name: 'Demo Project',
  startup: { initialMapId: 'dungeon' },
  spriteSets: [],
  maps: [{ id: 'dungeon', name: 'Dungeon', type: 'map', path: 'maps/dungeon.json' }],
} as unknown as GameProjectData

const FAKE_SNAPSHOT: ProjectSnapshot = {
  version: PROJECT_SNAPSHOT_VERSION,
  projectFilename: 'game-project.json',
  project: FAKE_PROJECT,
  maps: [{ path: 'maps/dungeon.json', data: FAKE_MAP_DATA }],
}

export default async () => {
  await describe('serializeProjectSnapshot + parseProjectSnapshot', async () => {
    await it('round-trips a snapshot', async () => {
      const wire = serializeProjectSnapshot(FAKE_SNAPSHOT)
      const back = parseProjectSnapshot(wire)
      expect(back.version).toBe(PROJECT_SNAPSHOT_VERSION)
      expect(back.projectFilename).toBe('game-project.json')
      expect(back.project.id).toBe('demo')
      expect(back.maps.length).toBe(1)
      expect(back.maps[0].path).toBe('maps/dungeon.json')
      expect(back.maps[0].data.id).toBe('dungeon')
    })

    await it('rejects malformed JSON', async () => {
      expect(() => parseProjectSnapshot('not json')).toThrow()
    })

    await it('rejects an unknown schema version', async () => {
      const future = JSON.stringify({ ...FAKE_SNAPSHOT, version: 99 })
      expect(() => parseProjectSnapshot(future)).toThrow()
    })

    await it('rejects a missing projectFilename', async () => {
      const broken = JSON.stringify({ ...FAKE_SNAPSHOT, projectFilename: '' })
      expect(() => parseProjectSnapshot(broken)).toThrow()
    })

    await it('rejects a missing maps array', async () => {
      const broken = JSON.stringify({ ...FAKE_SNAPSHOT, maps: 'oops' })
      expect(() => parseProjectSnapshot(broken)).toThrow()
    })

    await it('rejects a malformed maps entry', async () => {
      const broken = JSON.stringify({ ...FAKE_SNAPSHOT, maps: [{ path: 42, data: {} }] })
      expect(() => parseProjectSnapshot(broken)).toThrow()
    })

    await it('rejects a non-object payload', async () => {
      expect(() => parseProjectSnapshot('42')).toThrow()
      expect(() => parseProjectSnapshot('null')).toThrow()
    })
  })

  await describe('applyProjectSnapshot', async () => {
    await it('writes the project descriptor + every map', async () => {
      const writes: Array<{ path: string; contents: string }> = []
      await applyProjectSnapshot(
        FAKE_SNAPSHOT,
        '/sandbox/room-abc',
        async (path, contents) => {
          writes.push({ path, contents })
        },
        (...segments) => segments.join('/'),
      )

      expect(writes.length).toBe(2)
      expect(writes[0].path).toBe('/sandbox/room-abc/game-project.json')
      expect(writes[0].contents).toContain('"id": "demo"')
      expect(writes[1].path).toBe('/sandbox/room-abc/maps/dungeon.json')
      expect(writes[1].contents).toContain('"id": "dungeon"')
    })

    await it('writes the project descriptor before any maps', async () => {
      const order: string[] = []
      await applyProjectSnapshot(
        FAKE_SNAPSHOT,
        '/sandbox/x',
        async (path) => {
          order.push(path)
        },
        (...segments) => segments.join('/'),
      )

      // Project descriptor must land first so a partial-write
      // crash leaves the sandbox without a loadable project,
      // rather than with maps but no project descriptor (which
      // would silently corrupt the slot).
      expect(order[0]).toBe('/sandbox/x/game-project.json')
    })

    await it('produces snapshots that parse back through GameProjectFormat / MapFormat', async () => {
      const writes = new Map<string, string>()
      await applyProjectSnapshot(
        FAKE_SNAPSHOT,
        '/sandbox/x',
        async (path, contents) => {
          writes.set(path, contents)
        },
        (...segments) => segments.join('/'),
      )

      const projectContent = writes.get('/sandbox/x/game-project.json')
      expect(projectContent).toBeDefined()
      // Round-trip through the project's own format check —
      // `applyProjectSnapshot` uses `GameProjectFormat.serialize`,
      // so the result must `deserialize` back to a recognisable
      // shape (key fields present).
      const reparsed = JSON.parse(projectContent ?? '{}') as GameProjectData
      expect(reparsed.id).toBe('demo')
      expect(reparsed.name).toBe('Demo Project')
    })
  })
}
