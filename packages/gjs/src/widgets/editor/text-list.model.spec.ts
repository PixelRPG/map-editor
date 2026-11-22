import { describe, expect, it } from '@gjsify/unit'
import { addLine, lineText, moveLine, removeLine, retype, setLine } from './text-list.model.ts'

export default async () => {
  await describe('text-list model', async () => {
    await it('adds a blank line at the end without touching the input', async () => {
      const input = ['a']
      expect(addLine(input)).toStrictEqual(['a', ''])
      expect(input).toStrictEqual(['a'])
    })

    await it('removes one line by index', async () => {
      expect(removeLine(['a', 'b', 'c'], 1)).toStrictEqual(['a', 'c'])
      expect(removeLine(['a'], 5)).toStrictEqual(['a'])
    })

    await it('moves a line up, down and to either end', async () => {
      expect(moveLine(['a', 'b', 'c'], 1, 0)).toStrictEqual(['b', 'a', 'c'])
      expect(moveLine(['a', 'b', 'c'], 1, 2)).toStrictEqual(['a', 'c', 'b'])
      expect(moveLine(['a', 'b', 'c'], 0, 99)).toStrictEqual(['b', 'c', 'a'])
      expect(moveLine(['a', 'b'], 7, 0)).toStrictEqual(['a', 'b'])
    })

    await it('keeps a plain string plain when retyped', async () => {
      expect(setLine(['a', 'b'], 1, 'x')).toStrictEqual(['a', 'x'])
    })

    await it('keeps other languages when the default wording is retyped', async () => {
      expect(retype({ en: 'hi', de: 'hallo' }, 'hey')).toStrictEqual({ en: 'hey', de: 'hallo' })
      expect(lineText({ en: 'hi', de: 'hallo' })).toBe('hi')
      expect(lineText(undefined)).toBe('')
    })
  })
}
