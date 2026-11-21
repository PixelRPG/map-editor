import { describe, expect, it } from '@gjsify/unit'

import zeldaLike from '../../../../games/zelda-like/game-project.json' with { type: 'json' }
import type { GameProjectData } from '../types'
import { GameProjectFormat } from './GameProjectFormat'

function project(extra: Partial<GameProjectData> = {}, text: unknown = { en: 'Hi', de: 'Hallo' }): GameProjectData {
  return {
    version: '1.0.0',
    id: 'p',
    name: 'P',
    startup: { initialMapId: 'm', initialX: 0, initialY: 0, initialDirection: 'down' },
    maps: [{ id: 'm', name: 'M', path: './m.json', type: 'map' }],
    spriteSets: [],
    entityLibrary: [
      {
        id: 'sign',
        name: 'Sign',
        components: [{ type: 'actions', actions: [{ id: 'a', type: 'show-text', text }] }],
      },
    ],
    ...extra,
  } as unknown as GameProjectData
}

export default async () => {
  await describe('GameProjectFormat — languages', async () => {
    await it('opens a project without a languages block unchanged', async () => {
      expect(GameProjectFormat.validate(project({}, 'plain'))).toBe(true)
    })

    await it('rejects a malformed languages block', async () => {
      expect(() => GameProjectFormat.validate(project({ languages: { default: 'en', others: ['en'] } }))).toThrow()
      expect(() => GameProjectFormat.validate(project({ languages: { default: 'x y', others: [] } }))).toThrow()
    })

    await it('reports a locale used in game text that the project does not list', async () => {
      expect(
        GameProjectFormat.unlistedLocales(project({ languages: { default: 'en', others: ['de'] } })),
      ).toStrictEqual([])
      expect(GameProjectFormat.unlistedLocales(project({ languages: { default: 'en', others: [] } }))).toStrictEqual([
        'de',
      ])
      expect(GameProjectFormat.unlistedLocales(project({}, 'plain'))).toStrictEqual([])
      // reported, not rejected
      expect(GameProjectFormat.validate(project({ languages: { default: 'en', others: [] } }))).toBe(true)
    })

    await it('Kokiri Forest declares en + de and uses no unlisted locale', async () => {
      const data = zeldaLike as unknown as GameProjectData
      expect(data.languages).toStrictEqual({ default: 'en', others: ['de'] })
      expect(GameProjectFormat.unlistedLocales(data)).toStrictEqual([])
    })
  })
}
