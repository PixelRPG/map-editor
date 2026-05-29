import { describe, expect, it } from '@gjsify/unit'

import type { GameProjectData, MapData, SpriteSetData } from '../types'
import { GameProjectFormat } from './GameProjectFormat'
import { MapFormat } from './MapFormat'
import { SpriteSetFormat } from './SpriteSetFormat'

function makeProject(overrides: Partial<GameProjectData> = {}): GameProjectData {
  return {
    version: '1.0.0',
    id: 'p',
    name: 'P',
    startup: { initialMapId: 'm', initialX: 0, initialY: 0, initialDirection: 'down' },
    maps: [{ id: 'm', name: 'M', path: './m.json', type: 'map' }],
    spriteSets: [{ id: 's', path: './s.json', type: 'spriteset', firstGid: 1 }],
    ...overrides,
  }
}

function makeMap(overrides: Partial<MapData> = {}): MapData {
  return {
    id: 'm',
    name: 'M',
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: 4,
    rows: 4,
    layers: [{ id: 'l1', name: 'Layer 1', visible: true, sprites: [] }],
    spriteSets: [{ id: 's', path: '../spritesets/s.json', type: 'spriteset', firstGid: 1 }],
    ...overrides,
  }
}

function makeSpriteSet(overrides: Partial<SpriteSetData> = {}): SpriteSetData {
  return {
    version: '1.0.0',
    id: 's',
    name: 'S',
    image: { id: 'main', path: 's.png', type: 'image' },
    spriteWidth: 16,
    spriteHeight: 16,
    columns: 4,
    rows: 4,
    margin: 0,
    spacing: 0,
    sprites: [{ id: 0, col: 0, row: 0, name: 'Grass' }],
    ...overrides,
  }
}

export default async () => {
  await describe('GameProjectFormat — objectLibrary', async () => {
    await it('accepts a project without an objectLibrary (optional field)', async () => {
      expect(GameProjectFormat.validate(makeProject())).toBe(true)
    })

    await it('accepts a project with a valid objectLibrary', async () => {
      const project = makeProject({
        objectLibrary: [
          { id: 'apple', kind: 'item', name: 'Apple' },
          {
            id: 'cave',
            kind: 'teleport',
            name: 'Cave',
            trigger: { on: 'walk-onto' },
            properties: { targetMapId: 'm', targetTileX: 0, targetTileY: 0 },
          },
        ],
      })
      expect(GameProjectFormat.validate(project)).toBe(true)
    })

    await it('rejects a non-array objectLibrary', async () => {
      const project = makeProject({ objectLibrary: 'oops' as unknown as GameProjectData['objectLibrary'] })
      expect(() => GameProjectFormat.validate(project)).toThrow(/objectLibrary must be an array/)
    })

    await it('rejects malformed library entries', async () => {
      const project = makeProject({
        objectLibrary: [{ id: 'broken', kind: 'fancy' as unknown as 'event', name: 'Bad' }],
      })
      expect(() => GameProjectFormat.validate(project)).toThrow(/Invalid object definition at objectLibrary\[0\]/)
    })

    await it('rejects duplicate library ids', async () => {
      const project = makeProject({
        objectLibrary: [
          { id: 'x', kind: 'event', name: 'A' },
          { id: 'x', kind: 'event', name: 'B' },
        ],
      })
      expect(() => GameProjectFormat.validate(project)).toThrow(/Duplicate object definition id "x"/)
    })
  })

  await describe('MapFormat — objectPlacements', async () => {
    await it('accepts a map without placements (optional field)', async () => {
      expect(() => MapFormat.validate(makeMap())).not.toThrow()
    })

    await it('accepts placements referencing valid layers', async () => {
      const map = makeMap({
        objectPlacements: [
          { id: 'p1', layerId: 'l1', tileX: 1, tileY: 2, defId: 'apple' },
          {
            id: 'p2',
            layerId: 'l1',
            tileX: 3,
            tileY: 0,
            inline: { id: 'p2-def', kind: 'event', name: 'Sign', trigger: { on: 'action-button' } },
          },
        ],
      })
      expect(() => MapFormat.validate(map)).not.toThrow()
    })

    await it('rejects placements pointing at unknown layers (catches orphaned refs)', async () => {
      const map = makeMap({
        objectPlacements: [{ id: 'p1', layerId: 'ghost-layer', tileX: 0, tileY: 0, defId: 'apple' }],
      })
      expect(() => MapFormat.validate(map)).toThrow(/references unknown layer "ghost-layer"/)
    })

    await it('rejects duplicate placement ids within a map', async () => {
      const map = makeMap({
        objectPlacements: [
          { id: 'dup', layerId: 'l1', tileX: 0, tileY: 0, defId: 'apple' },
          { id: 'dup', layerId: 'l1', tileX: 1, tileY: 1, defId: 'apple' },
        ],
      })
      expect(() => MapFormat.validate(map)).toThrow(/Duplicate object placement id "dup"/)
    })

    await it('rejects placements that violate the defId / inline mutual exclusion', async () => {
      const map = makeMap({
        objectPlacements: [
          {
            id: 'p1',
            layerId: 'l1',
            tileX: 0,
            tileY: 0,
            defId: 'apple',
            inline: { id: 'inline-def', kind: 'item', name: 'Apple' },
          },
        ],
      })
      expect(() => MapFormat.validate(map)).toThrow(/Invalid object placement/)
    })
  })

  await describe('SpriteSetFormat — tileProperties', async () => {
    await it('accepts a sprite-set without tile properties', async () => {
      expect(SpriteSetFormat.validate(makeSpriteSet())).toBe(true)
    })

    await it('accepts sprites with tile properties', async () => {
      const set = makeSpriteSet({
        sprites: [
          {
            id: 0,
            col: 0,
            row: 0,
            name: 'Water',
            tileProperties: { walkable: false, surface: 'water', footstepSound: 'splash' },
          },
        ],
      })
      expect(SpriteSetFormat.validate(set)).toBe(true)
    })

    await it('rejects malformed tileProperties shapes', async () => {
      const set = makeSpriteSet({
        sprites: [
          {
            id: 0,
            col: 0,
            row: 0,
            tileProperties: { walkable: 'maybe' as unknown as boolean },
          },
        ],
      })
      expect(() => SpriteSetFormat.validate(set)).toThrow(/Invalid tileProperties on sprite at index 0/)
    })
  })
}
