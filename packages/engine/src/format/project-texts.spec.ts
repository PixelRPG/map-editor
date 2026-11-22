import { describe, expect, it } from '@gjsify/unit'

import type { GameProjectData, MapData } from '../types'
import { GameProjectFormat } from './GameProjectFormat'
import { localeLabel, localesToAdd } from '../types/data/index'
import { hasTextIn, missingTextCount, projectTexts } from './project-texts'

const sign = (text: unknown) => ({ type: 'actions', actions: [{ id: 'a', type: 'show-text', text }] })

function project(entityLibrary: unknown[] = [], others: string[] = ['de']): GameProjectData {
  return {
    version: '1.0.0',
    id: 'p',
    name: 'P',
    startup: { initialMapId: 'm', initialX: 0, initialY: 0, initialDirection: 'down' },
    maps: [],
    spriteSets: [],
    languages: { default: 'en', others },
    entityLibrary,
  } as unknown as GameProjectData
}

function map(objectPlacements: unknown[]): MapData {
  return { id: 'm', objectPlacements } as unknown as MapData
}

const place = (extra: Record<string, unknown>) => ({ id: 'p1', layerId: 'l', tileX: 0, tileY: 0, ...extra })

export default async () => {
  await describe('project texts — one collector', async () => {
    await it('collects library entries, inline definitions and override components', async () => {
      const data = project([{ id: 'lib', name: 'L', components: [sign('lib')] }])
      const maps = [
        map([
          place({ inline: { id: 'i', name: 'I', components: [sign('inline')] } }),
          place({ id: 'p2', defId: 'lib', overrides: { components: [sign('override')] } }),
        ]),
      ]
      expect(projectTexts(data, maps)).toStrictEqual(['lib', 'inline', 'override'])
    })

    await it('reaches states and the nested actions of ask options', async () => {
      const ask = {
        type: 'actions',
        actions: [
          {
            id: 'q',
            type: 'ask',
            prompt: 'Q?',
            options: [{ id: 'o', label: 'Yes', actions: [{ id: 'n', type: 'show-text', text: 'Nested' }] }],
          },
        ],
      }
      const data = project([{ id: 'a', name: 'A', components: [], states: [{ id: 's', components: [ask] }] }])
      expect(projectTexts(data)).toStrictEqual(['Q?', 'Yes', 'Nested'])
    })

    await it('counts missing texts per language, placements included', async () => {
      const data = project([
        { id: 'lib', name: 'L', components: [sign({ en: 'Hi', de: 'Hallo' }), sign('plain'), sign({ en: 'Only' })] },
      ])
      const maps = [
        map([
          place({ inline: { id: 'i', name: 'I', components: [sign({ en: 'Inline', de: '' })] } }),
          place({ id: 'p2', defId: 'lib', overrides: { components: [sign({ en: 'Over', de: 'Ueber' })] } }),
        ]),
      ]
      expect(missingTextCount(data, [], 'de')).toBe(2)
      expect(missingTextCount(data, maps, 'de')).toBe(3)
      expect(missingTextCount(data, maps, 'en')).toBe(0)
      expect(missingTextCount(data, maps, 'fr')).toBe(5)
    })

    await it('does not count a text that is empty in the default language', async () => {
      expect(missingTextCount(project([{ id: 'a', name: 'A', components: [sign('')] }]), [], 'de')).toBe(0)
    })

    await it('answers whether a language has any text', async () => {
      const data = project([{ id: 'a', name: 'A', components: [sign({ en: 'Hi', de: 'Hallo' })] }])
      expect(hasTextIn(data, [], 'de')).toBe(true)
      expect(hasTextIn(data, [], 'fr')).toBe(false)
    })

    await it('shares one collector with the unlisted-locale warning', async () => {
      const data = project([], [])
      const maps = [map([place({ inline: { id: 'i', name: 'I', components: [sign({ en: 'Hi', fr: 'Salut' })] } })])]
      expect(GameProjectFormat.unlistedLocales(data)).toStrictEqual([])
      expect(GameProjectFormat.unlistedLocales(data, maps)).toStrictEqual(['fr'])
    })
  })

  await describe('locale names', async () => {
    await it('names a language in itself and falls back to the code', async () => {
      expect(localeLabel('de')).toBe('Deutsch')
      expect(localeLabel('xx')).toBe('xx')
    })

    await it('offers only languages the project does not have', async () => {
      const codes = localesToAdd(['en', 'de']).map((l) => l.code)
      expect(codes.includes('de')).toBe(false)
      expect(codes.includes('fr')).toBe(true)
    })
  })
}
