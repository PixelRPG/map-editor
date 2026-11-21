import type { CreditEntry } from '@pixelrpg/engine'
import { describe, expect, it } from '@gjsify/unit'

import {
  addCredit,
  creditDraftProblems,
  creditFromDraft,
  draftOfCredit,
  emptyCreditDraft,
  newCreditId,
  removeCredit,
  replaceCredit,
  safeCreditUrl,
} from './credits-edit.ts'

const a: CreditEntry = { id: 'a', role: 'art', name: 'Forest tiles', license: 'CC0', url: 'https://example.org/a' }
const b: CreditEntry = { id: 'b', role: 'music', name: 'Theme' }

export default async () => {
  await describe('credit drafts', async () => {
    await it('needs a name, and rejects a url that is not http(s)', async () => {
      const d = emptyCreditDraft()
      expect(creditDraftProblems(d)).toStrictEqual({ nameMissing: true, urlInvalid: false })
      expect(creditDraftProblems({ ...d, name: '  ' }).nameMissing).toBe(true)
      expect(creditDraftProblems({ ...d, name: 'x', url: 'ftp://example.org' }).urlInvalid).toBe(true)
      expect(creditDraftProblems({ ...d, name: 'x', url: 'javascript:alert(1)' }).urlInvalid).toBe(true)
      expect(creditDraftProblems({ ...d, name: 'x', url: 'example.org' }).urlInvalid).toBe(true)
      expect(creditDraftProblems({ ...d, name: 'x', url: ' https://example.org ' })).toStrictEqual({
        nameMissing: false,
        urlInvalid: false,
      })
    })

    await it('trims and leaves empty optional fields out', async () => {
      const entry = creditFromDraft({ name: ' Tiles ', role: 'art', license: ' ', url: '' }, 'x')
      expect(entry).toStrictEqual({ id: 'x', role: 'art', name: 'Tiles' })
    })

    await it('round-trips an entry through a draft', async () => {
      expect(creditFromDraft(draftOfCredit(a), 'a')).toStrictEqual(a)
      expect(creditFromDraft(draftOfCredit(b), 'b')).toStrictEqual(b)
    })
  })

  await describe('safeCreditUrl', async () => {
    await it('passes http(s) and nothing else', async () => {
      expect(safeCreditUrl('https://example.org/x')).toBe('https://example.org/x')
      expect(safeCreditUrl('http://example.org')).toBe('http://example.org')
      expect(safeCreditUrl('file:///etc/passwd')).toBe(null)
      expect(safeCreditUrl('javascript:alert(1)')).toBe(null)
      expect(safeCreditUrl('not a url')).toBe(null)
      expect(safeCreditUrl(undefined)).toBe(null)
    })
  })

  await describe('credit list edits', async () => {
    await it('adds at the end without touching the input', async () => {
      const list = [a]
      expect(addCredit(list, b).map((c) => c.id)).toStrictEqual(['a', 'b'])
      expect(list.length).toBe(1)
    })

    await it('replaces in place, keeping the order', async () => {
      const next = replaceCredit([a, b], { ...a, name: 'Renamed' })
      expect(next.map((c) => c.name)).toStrictEqual(['Renamed', 'Theme'])
    })

    await it('keeps an edit whose entry a peer removed meanwhile', async () => {
      expect(replaceCredit([b], a).map((c) => c.id)).toStrictEqual(['b', 'a'])
    })

    await it('removes one entry and hands back the list that undoes it', async () => {
      const removal = removeCredit([a, b], 'a')
      expect(removal?.next.map((c) => c.id)).toStrictEqual(['b'])
      expect(removal?.previous.map((c) => c.id)).toStrictEqual(['a', 'b'])
    })

    await it('reports nothing to remove for an unknown id', async () => {
      expect(removeCredit([a], 'zzz')).toBe(null)
    })

    await it('undo restores the exact previous list', async () => {
      const list = [a, b]
      const removal = removeCredit(list, 'b')
      expect(removal?.previous).toStrictEqual(list)
    })
  })

  await describe('newCreditId', async () => {
    await it('skips an id the list already uses', async () => {
      const draws = [0.5, 0.5, 0.25]
      const random = () => draws.shift() ?? 0.75
      const first = newCreditId([], () => 0.5)
      const id = newCreditId([{ id: first, role: 'art', name: 'x' }], random)
      expect(id === first).toBe(false)
      expect(id.startsWith('credit-')).toBe(true)
    })
  })
}
