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

  await describe('parseProjectSnapshot — path-traversal defence', async () => {
    const wireWithFilename = (filename: string): string =>
      JSON.stringify({ ...FAKE_SNAPSHOT, projectFilename: filename })

    const wireWithMapPath = (mapPath: string): string =>
      JSON.stringify({
        ...FAKE_SNAPSHOT,
        maps: [{ path: mapPath, data: FAKE_MAP_DATA }],
      })

    await it('rejects projectFilename with parent-directory segments', async () => {
      expect(() => parseProjectSnapshot(wireWithFilename('../bad.json'))).toThrow()
    })

    await it('rejects projectFilename containing path separators', async () => {
      // The contract is a single segment — even a benign-looking subdir is a contract violation.
      expect(() => parseProjectSnapshot(wireWithFilename('subdir/game-project.json'))).toThrow()
    })

    await it('rejects absolute projectFilename', async () => {
      expect(() => parseProjectSnapshot(wireWithFilename('/etc/passwd'))).toThrow()
    })

    await it('rejects Windows-drive projectFilename', async () => {
      expect(() => parseProjectSnapshot(wireWithFilename('C:foo'))).toThrow()
    })

    await it('rejects projectFilename with a NUL byte', async () => {
      expect(() => parseProjectSnapshot(wireWithFilename('safe.json\0/etc/passwd'))).toThrow()
    })

    await it('rejects projectFilename containing a backslash', async () => {
      expect(() => parseProjectSnapshot(wireWithFilename('safe\\windows.json'))).toThrow()
    })

    await it('rejects maps[].path with parent-directory segments', async () => {
      expect(() => parseProjectSnapshot(wireWithMapPath('../../etc/passwd'))).toThrow()
      expect(() => parseProjectSnapshot(wireWithMapPath('maps/../../etc/passwd'))).toThrow()
    })

    await it('rejects absolute maps[].path', async () => {
      expect(() => parseProjectSnapshot(wireWithMapPath('/etc/passwd'))).toThrow()
    })

    await it('rejects maps[].path with a NUL byte', async () => {
      expect(() => parseProjectSnapshot(wireWithMapPath('safe\0/etc/passwd'))).toThrow()
    })

    await it('accepts harmless relative subpaths for maps[].path', async () => {
      // Sanity check the validator does not over-reject — `maps/foo.json`
      // is the normal shape produced by gjsify init scaffolding.
      const snap = parseProjectSnapshot(wireWithMapPath('maps/dungeon.json'))
      expect(snap.maps[0].path).toBe('maps/dungeon.json')
    })
  })

  await describe('applyProjectSnapshot — sandbox containment', async () => {
    /** Small helper: assert an async function throws. The unit matcher
     * surface here is sync-only (`expect(fn).toThrow()`), so we hand-
     * roll the async equivalent. */
    const expectAsyncThrow = async (
      run: () => Promise<unknown>,
      description: string,
    ): Promise<void> => {
      let caught: unknown = null
      try {
        await run()
      } catch (err) {
        caught = err
      }
      if (!caught) throw new Error(`expected ${description} to throw, but it resolved`)
    }

    await it('rejects an in-memory snapshot with a traversing projectFilename', async () => {
      const evil: ProjectSnapshot = { ...FAKE_SNAPSHOT, projectFilename: '../escape.json' }
      let writes = 0
      await expectAsyncThrow(
        () =>
          applyProjectSnapshot(
            evil,
            '/sandbox/x',
            async () => {
              writes++
            },
            (...segments) => segments.join('/'),
          ),
        'applyProjectSnapshot(evil filename)',
      )
      expect(writes).toBe(0)
    })

    await it('rejects when the caller-supplied joinPath escapes targetDir', async () => {
      // Even with a "safe" relative path, a hostile / buggy joinPath
      // (e.g. one that strips the targetDir prefix) must be caught.
      let writes = 0
      await expectAsyncThrow(
        () =>
          applyProjectSnapshot(
            FAKE_SNAPSHOT,
            '/sandbox/x',
            async () => {
              writes++
            },
            // Hostile joiner: drops targetDir, returns absolute path.
            (_target, file) => `/etc/${file}`,
          ),
        'applyProjectSnapshot(hostile joinPath)',
      )
      expect(writes).toBe(0)
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
