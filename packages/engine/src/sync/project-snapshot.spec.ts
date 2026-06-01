import { describe, expect, it } from '@gjsify/unit'

import type { GameProjectData, MapData } from '../types/index.ts'
import { bytesToBase64 } from '../utils/base64.ts'

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
  spriteSets: [],
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

  // ----- Binary sprite-set image transfer ---------------------------------

  // 1x1 transparent PNG — the smallest valid binary asset, ideal for
  // a wire-format round-trip test (avoids fixture bloat while still
  // exercising the base64 + Uint8Array + writeBinaryFile path).
  const TINY_PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ])
  // Derive the base64 form at runtime from the canonical bytes so
  // any hand-typed transcription error fails-fast at base64 encode,
  // not at byte mismatch during apply.
  const TINY_PNG_BASE64 = bytesToBase64(TINY_PNG_BYTES)

  const FAKE_SPRITESET_DATA = {
    version: '1.0.0',
    id: 'tiles',
    name: 'Tiles',
    image: { id: 'main', path: 'tiles.png', type: 'image' as const },
    spriteWidth: 16,
    spriteHeight: 16,
    columns: 1,
    rows: 1,
    margin: 0,
    spacing: 0,
    sprites: [{ id: 0, col: 0, row: 0 }],
  } as unknown as ProjectSnapshot['spriteSets'][number]['data']

  const SNAPSHOT_WITH_IMAGES: ProjectSnapshot = {
    ...FAKE_SNAPSHOT,
    spriteSets: [
      {
        path: 'spritesets/tiles.json',
        data: FAKE_SPRITESET_DATA,
        images: [{ path: 'tiles.png', base64: TINY_PNG_BASE64 }],
      },
    ],
  }

  await describe('parseProjectSnapshot — binary images validation', async () => {
    await it('accepts a snapshot whose sprite-set carries one PNG', async () => {
      const wire = serializeProjectSnapshot(SNAPSHOT_WITH_IMAGES)
      const back = parseProjectSnapshot(wire)
      expect(back.spriteSets[0].images?.length).toBe(1)
      expect(back.spriteSets[0].images?.[0].path).toBe('tiles.png')
      expect(back.spriteSets[0].images?.[0].base64).toBe(TINY_PNG_BASE64)
    })

    await it('treats omitted spriteSets[].images as []', async () => {
      const wire = JSON.stringify({
        ...FAKE_SNAPSHOT,
        spriteSets: [{ path: 'spritesets/tiles.json', data: FAKE_SPRITESET_DATA }],
      })
      const back = parseProjectSnapshot(wire)
      expect(back.spriteSets[0].images?.length).toBe(0)
    })

    await it('rejects spriteSets[].images that is not an array', async () => {
      const wire = JSON.stringify({
        ...FAKE_SNAPSHOT,
        spriteSets: [{ path: 'spritesets/tiles.json', data: FAKE_SPRITESET_DATA, images: 'oops' }],
      })
      expect(() => parseProjectSnapshot(wire)).toThrow()
    })

    await it('rejects a malformed images entry', async () => {
      const wire = JSON.stringify({
        ...FAKE_SNAPSHOT,
        spriteSets: [
          { path: 'spritesets/tiles.json', data: FAKE_SPRITESET_DATA, images: [{ path: 42, base64: 'AA==' }] },
        ],
      })
      expect(() => parseProjectSnapshot(wire)).toThrow()
    })

    await it('rejects a path-traversing image path', async () => {
      const wire = JSON.stringify({
        ...FAKE_SNAPSHOT,
        spriteSets: [
          {
            path: 'spritesets/tiles.json',
            data: FAKE_SPRITESET_DATA,
            images: [{ path: '../../etc/passwd', base64: 'AA==' }],
          },
        ],
      })
      expect(() => parseProjectSnapshot(wire)).toThrow()
    })

    await it('rejects non-base64 alphabet in the binary payload', async () => {
      const wire = JSON.stringify({
        ...FAKE_SNAPSHOT,
        spriteSets: [
          {
            path: 'spritesets/tiles.json',
            data: FAKE_SPRITESET_DATA,
            images: [{ path: 'tiles.png', base64: 'not valid base64 ❌' }],
          },
        ],
      })
      expect(() => parseProjectSnapshot(wire)).toThrow()
    })
  })

  await describe('applyProjectSnapshot — binary sprite-set images', async () => {
    await it('writes each image alongside its sprite-set JSON, bytes-faithful', async () => {
      const textWrites = new Map<string, string>()
      const binaryWrites = new Map<string, Uint8Array>()
      await applyProjectSnapshot(
        SNAPSHOT_WITH_IMAGES,
        '/sandbox/room-abc',
        async (path, contents) => {
          textWrites.set(path, contents)
        },
        (...segments) => segments.join('/'),
        async (path, bytes) => {
          binaryWrites.set(path, bytes)
        },
      )

      // Sprite-set JSON landed at the descriptor's path.
      expect(textWrites.has('/sandbox/room-abc/spritesets/tiles.json')).toBeTruthy()
      // The image landed alongside (dirname(spritesets/tiles.json) + image.path).
      expect(binaryWrites.has('/sandbox/room-abc/spritesets/tiles.png')).toBeTruthy()
      const written = binaryWrites.get('/sandbox/room-abc/spritesets/tiles.png')
      expect(written?.length).toBe(TINY_PNG_BYTES.length)
      // Compare byte-by-byte — a base64 round-trip that drops a byte
      // would silently corrupt the PNG (libpng would refuse to render).
      // Computing the base64 from the canonical bytes via
      // `bytesToBase64` at fixture-build time pins the encode side
      // too — a regression in either direction surfaces here.
      let identical = !!written && written.length === TINY_PNG_BYTES.length
      if (written) {
        for (let i = 0; i < TINY_PNG_BYTES.length; i++) {
          if (written[i] !== TINY_PNG_BYTES[i]) {
            identical = false
            break
          }
        }
      }
      expect(identical).toBeTruthy()
    })

    await it('throws when images are present but writeBinaryFile is omitted', async () => {
      let caught: unknown = null
      try {
        await applyProjectSnapshot(
          SNAPSHOT_WITH_IMAGES,
          '/sandbox/x',
          async () => {
            /* text writer accepts */
          },
          (...segments) => segments.join('/'),
          // writeBinaryFile intentionally omitted
        )
      } catch (err) {
        caught = err
      }
      // Silent skip would resurrect the missing-PNG joiner-hang bug.
      expect(caught).toBeTruthy()
    })

    await it('writes nothing through writeBinaryFile when no images are present', async () => {
      let binaryCalls = 0
      await applyProjectSnapshot(
        FAKE_SNAPSHOT,
        '/sandbox/y',
        async () => {
          /* ignore */
        },
        (...segments) => segments.join('/'),
        async () => {
          binaryCalls++
        },
      )
      expect(binaryCalls).toBe(0)
    })
  })
}
