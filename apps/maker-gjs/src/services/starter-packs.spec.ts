import { describe, expect, it } from '@gjsify/unit'
import type { CreditEntry, SpriteSetReference } from '@pixelrpg/engine'

import {
  attachSpriteSetReference,
  mapReferenceForSpriteSet,
  mergePackCredit,
  parseStarterPacks,
  shelfModel,
  type StarterPack,
} from './starter-packs.ts'

const credit: CreditEntry = { id: 'roguelike-pack', role: 'art', name: 'Pack by Someone', license: 'CC0' }
const pack: StarterPack = { id: 'roguelike', name: 'Roguelike', spriteSet: 'a/b.json', license: 'CC0', credit }

export default async () => {
  await describe('parseStarterPacks', async () => {
    await it('reads a complete entry', async () => {
      expect(parseStarterPacks({ packs: [pack] })).toStrictEqual([pack])
    })

    await it('drops entries that are half-made, escape games/ or repeat an id', async () => {
      const broken = [
        { ...pack, id: 'Bad Id' },
        { ...pack, id: 'no-credit', credit: undefined },
        { ...pack, id: 'no-name', name: ' ' },
        { ...pack, id: 'up', spriteSet: '../x.json' },
        { ...pack, id: 'abs', spriteSet: '/etc/x.json' },
        { ...pack, id: 'bad-role', credit: { ...credit, role: 'wizard' } },
        pack,
        { ...pack, name: 'Second' },
      ]
      expect(parseStarterPacks({ packs: broken })).toStrictEqual([pack])
    })

    await it('survives a file that is not a catalogue', async () => {
      expect(parseStarterPacks(null)).toStrictEqual([])
      expect(parseStarterPacks({ packs: 'x' })).toStrictEqual([])
    })

    await it('keeps only an http(s) credit link', async () => {
      const [parsed] = parseStarterPacks({ packs: [{ ...pack, credit: { ...credit, url: 'javascript:alert(1)' } }] })
      expect(parsed.credit.url).toBe(undefined)
    })
  })

  await describe('shelfModel', async () => {
    await it('tells new, attach and added apart', async () => {
      const none = new Set<string>()
      const has = new Set(['roguelike'])
      expect(shelfModel([pack], none, none)[0].state).toBe('new')
      expect(shelfModel([pack], has, none)[0].state).toBe('attach')
      expect(shelfModel([pack], has, has)[0].state).toBe('added')
    })

    await it('answers from the project alone when no map is open', async () => {
      expect(shelfModel([pack], new Set(['roguelike']), null)[0].state).toBe('added')
      expect(shelfModel([pack], new Set(), null)[0].state).toBe('new')
    })
  })

  await describe('mergePackCredit', async () => {
    await it('appends the credit once', async () => {
      const once = mergePackCredit([], credit)
      expect(once).toStrictEqual([credit])
      expect(mergePackCredit(once, credit)).toBe(once)
    })

    await it('does not repeat a credit typed in by hand', async () => {
      const typed: CreditEntry[] = [{ id: 'credit-abc123', role: 'art', name: 'pack by someone' }]
      expect(mergePackCredit(typed, credit)).toBe(typed)
    })

    await it("keeps other people's credits", async () => {
      const other: CreditEntry = { id: 'x', role: 'music', name: 'Someone Else' }
      expect(mergePackCredit([other], credit)).toStrictEqual([other, credit])
    })
  })

  await describe('attachSpriteSetReference', async () => {
    await it('adds the set to a map once', async () => {
      const ref = mapReferenceForSpriteSet('roguelike', 1768)
      expect(ref.path).toBe('../spritesets/roguelike.json')
      const once = attachSpriteSetReference([], ref)
      expect(once).toStrictEqual([ref])
      expect(attachSpriteSetReference(once, ref)).toBe(once)
    })

    await it('keeps the sets the map already has', async () => {
      const other: SpriteSetReference = {
        id: 'water',
        path: '../spritesets/water.json',
        type: 'spriteset',
        firstGid: 1,
      }
      const ref = mapReferenceForSpriteSet('roguelike', 1025)
      expect(attachSpriteSetReference([other], ref)).toStrictEqual([other, ref])
    })
  })
}
