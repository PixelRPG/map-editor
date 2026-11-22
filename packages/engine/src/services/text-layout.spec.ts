import { describe, expect, it } from '@gjsify/unit'

import { layoutText, measureText, type AdvanceFn } from './text-layout'

/** Every glyph 6 px wide: a 30 px box holds exactly 5 of them. */
const mono: AdvanceFn = () => 6
/** Narrow i/l/space, wide m/w: exercises the width sum, not the character count. */
const varied: AdvanceFn = (ch) => (/[il' ]/.test(ch) ? 3 : /[mwMW]/.test(ch) ? 9 : 6)

const lines = (text: string, maxWidth: number, advance: AdvanceFn = mono, maxLines?: number): string[][] =>
  layoutText(text, { maxWidth, advance, maxLines }).map((p) => p.lines)

export default async () => {
  await describe('layoutText', async () => {
    await it('has no pages for empty or newline-only text', async () => {
      expect(lines('', 60)).toStrictEqual([])
      expect(lines('\n\n', 60)).toStrictEqual([])
    })

    await it('keeps text that fits on one line of one page', async () => {
      expect(lines('Hallo', 60)).toStrictEqual([['Hallo']])
    })

    await it('wraps at spaces and drops the space it broke at', async () => {
      expect(lines('aaa bbb ccc', 42)).toStrictEqual([['aaa bbb', 'ccc']])
      expect(lines('aaaaa bbbbb', 30)).toStrictEqual([['aaaaa', 'bbbbb']])
    })

    await it('collapses nothing inside a line but never starts a line with a space', async () => {
      expect(lines('aa   bb', 12)).toStrictEqual([['aa', 'bb']])
      expect(lines('  ab', 60)).toStrictEqual([['  ab']])
    })

    await it('paginates at three lines by default and at maxLines otherwise', async () => {
      const text = 'a1 b2 c3 d4 e5 f6 g7'
      expect(lines(text, 12)).toStrictEqual([['a1', 'b2', 'c3'], ['d4', 'e5', 'f6'], ['g7']])
      expect(lines(text, 12, mono, 2)).toStrictEqual([['a1', 'b2'], ['c3', 'd4'], ['e5', 'f6'], ['g7']])
    })

    await it('honours explicit newlines, \\r\\n and trailing newlines', async () => {
      expect(lines('eins\nzwei', 60)).toStrictEqual([['eins', 'zwei']])
      expect(lines('eins\r\nzwei\n', 60)).toStrictEqual([['eins', 'zwei']])
    })

    await it('keeps a blank line inside a page but never at its edge', async () => {
      expect(lines('a\n\nb', 60)).toStrictEqual([['a', '', 'b']])
      expect(lines('a\nb\nc\n\nd', 60)).toStrictEqual([['a', 'b', 'c'], ['d']])
    })

    await it('never breaks at a non-breaking space', async () => {
      expect(lines('xx 10\u00A0km', 36)).toStrictEqual([['xx', '10\u00A0km']])
    })

    await it('cuts a word that fits no line, with a hyphen between letters', async () => {
      const out = lines('Donaudampfschifffahrt', 30, mono, 9)[0]
      for (const line of out) expect(measureText(line, mono) <= 30).toBe(true)
      expect(out.slice(0, -1).every((l) => l.endsWith('-'))).toBe(true)
      expect(out.join('').replaceAll('-', '')).toBe('Donaudampfschifffahrt')
    })

    await it('cuts digits without a hyphen', async () => {
      expect(lines('1234567890', 30)).toStrictEqual([['12345', '67890']])
    })

    await it('breaks at a soft hyphen and shows the hyphen only there', async () => {
      const shy = 'Kranken\u00ADhaus\u00ADaufenthalt'
      expect(lines(shy, 60, mono, 9)[0]).toStrictEqual(['Kranken-', 'haus-', 'aufenthalt'])
      expect(lines('Kranken\u00ADhaus', 72)).toStrictEqual([['Krankenhaus']])
    })

    await it('skips a soft hyphen whose hyphen would not fit', async () => {
      expect(lines('abcde\u00ADfgh', 30, mono, 9)[0].join('|')).toBe('abcd-|efgh')
    })

    await it('breaks German compounds after a literal hyphen and at zero-width spaces', async () => {
      expect(lines('Nord-Ost-Passage', 36, mono, 9)).toStrictEqual([['Nord-', 'Ost-', 'Passa-', 'ge']])
      expect(lines('Nord-Ost-Passage', 60)).toStrictEqual([['Nord-Ost-', 'Passage']])
      expect(lines('ab\u200Bcd', 12)).toStrictEqual([['ab', 'cd']])
    })

    await it('does not treat a lone dash between spaces as a place to keep text', async () => {
      expect(lines('a - b', 12)).toStrictEqual([['a', '-', 'b']])
    })

    await it('fits every line to the box with variable advances', async () => {
      const text = 'Willkommen im Dorf, wundervolle Reisende! Lilli will wirklich mitmachen.'
      for (const width of [24, 40, 66, 120]) {
        for (const page of layoutText(text, { maxWidth: width, advance: varied })) {
          expect(page.lines.length <= 3).toBe(true)
          for (const line of page.lines) {
            const words = line.split(' ')
            // a lone word may be a single glyph wider than a tiny box, never more
            if (words.length > 1 || line.length > 1) expect(measureText(line, varied) <= width).toBe(true)
          }
        }
      }
    })

    await it('terminates when the box is narrower than one glyph', async () => {
      expect(lines('abc', 3)).toStrictEqual([['a', 'b', 'c']])
    })

    await it('rejects a non-positive width and a bad line count', async () => {
      expect(() => layoutText('a', { maxWidth: 0, advance: mono })).toThrow()
      expect(() => layoutText('a', { maxWidth: Number.NaN, advance: mono })).toThrow()
      expect(() => layoutText('a', { maxWidth: 10, advance: mono, maxLines: 0 })).toThrow()
    })
  })

  await describe('measureText', async () => {
    await it('sums advances and ignores invisible break marks', async () => {
      expect(measureText('ab\u00ADc\u200B', mono)).toBe(18)
      expect(measureText('', mono)).toBe(0)
    })
  })
}
