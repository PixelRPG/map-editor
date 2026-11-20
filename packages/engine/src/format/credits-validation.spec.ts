import { describe, expect, it } from '@gjsify/unit'

import blankStarter from '../../../../games/blank-starter/game-project.json' with { type: 'json' }
import zeldaLike from '../../../../games/zelda-like/game-project.json' with { type: 'json' }
import type { CreditEntry, GameProjectData } from '../types'
import { GameProjectFormat } from './GameProjectFormat'

function project(credits?: unknown): GameProjectData {
  return {
    version: '1.0.0',
    id: 'p',
    name: 'P',
    startup: { initialMapId: 'm', initialX: 0, initialY: 0, initialDirection: 'down' },
    maps: [{ id: 'm', name: 'M', path: './m.json', type: 'map' }],
    spriteSets: [],
    ...(credits === undefined ? {} : { credits }),
  } as GameProjectData
}

const art: CreditEntry = {
  id: 'a',
  role: 'art',
  name: 'Tiles by Someone',
  license: 'CC0',
  url: 'https://example.org/tiles',
}

export default async () => {
  await describe('GameProjectFormat — credits', async () => {
    await it('accepts a project without credits (older files)', async () => {
      expect(GameProjectFormat.validate(project())).toBe(true)
    })

    await it('accepts valid entries, optional fields omitted or present', async () => {
      expect(GameProjectFormat.validate(project([art, { id: 'b', role: 'other', name: 'Thanks' }]))).toBe(true)
    })

    await it('round-trips through serialize/deserialize', async () => {
      const back = GameProjectFormat.deserialize(GameProjectFormat.serialize(project([art])))
      expect(back.credits).toStrictEqual([art])
    })

    await it('the shipped games load through the loader path with valid credits', async () => {
      for (const game of [blankStarter, zeldaLike]) {
        const loaded = GameProjectFormat.deserialize(JSON.stringify(game))
        expect(loaded.credits?.length).toBeGreaterThan(0)
      }
    })

    await it('a project without credits loads with the field absent (readers treat it as empty)', async () => {
      const loaded = GameProjectFormat.deserialize(JSON.stringify(project()))
      expect(loaded.credits).toBeUndefined()
    })

    await it('rejects a non-array', async () => {
      expect(() => GameProjectFormat.validate(project({}))).toThrow()
    })

    await it('rejects an unknown role', async () => {
      expect(() => GameProjectFormat.validate(project([{ ...art, role: 'painter' }]))).toThrow()
    })

    await it('rejects an empty name and a missing id', async () => {
      expect(() => GameProjectFormat.validate(project([{ ...art, name: '  ' }]))).toThrow()
      expect(() => GameProjectFormat.validate(project([{ ...art, id: '' }]))).toThrow()
    })

    await it('rejects a duplicate id', async () => {
      expect(() => GameProjectFormat.validate(project([art, art]))).toThrow()
    })

    await it('rejects urls that do not parse as http(s)', async () => {
      for (const url of [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'ftp://example.org',
        'not a url',
        'mailto:a@b.c',
      ]) {
        expect(() => GameProjectFormat.validate(project([{ ...art, url }]))).toThrow()
      }
      expect(GameProjectFormat.validate(project([{ ...art, url: 'http://example.org' }]))).toBe(true)
    })
  })
}
