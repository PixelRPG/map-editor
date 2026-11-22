/** Advance in UI pixels of one code point, from the font that will draw it. */
export type AdvanceFn = (char: string) => number

export interface TextLayoutOptions {
  /** Inner width of the box, in UI pixels. */
  maxWidth: number
  /** Lines per page. Default {@link DEFAULT_MAX_LINES}. */
  maxLines?: number
  advance: AdvanceFn
}

/** One screenful of the box. */
export interface TextPage {
  lines: string[]
}

export const DEFAULT_MAX_LINES = 3

const SOFT_HYPHEN = '\u00AD'
const ZERO_WIDTH_SPACE = '\u200B'
const HYPHEN = '-'
const LETTER = /\p{L}/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

type UnitKind = 'char' | 'space' | 'shy' | 'zwsp'

interface Unit {
  ch: string
  adv: number
  kind: UnitKind
}

/** A place a line may end: keep `units[start..end)`, continue at `next`. */
interface Candidate {
  end: number
  next: number
  /** Draw a hyphen after the kept text. */
  hyphen: boolean
}

/**
 * Wrap `text` to `maxWidth` and split it into pages of `maxLines` lines.
 *
 * Lines break at spaces, after a literal hyphen that follows a letter or
 * digit, at U+200B, and at U+00AD (which then shows a hyphen; unbroken it
 * is invisible). U+00A0 never breaks. A word that fits no line is cut at
 * the last glyph that fits, with a hyphen between two letters. Explicit
 * newlines end a line; a blank line is kept inside a page but never opens
 * or closes one. Empty text has no pages.
 */
export function layoutText(text: string, options: TextLayoutOptions): TextPage[] {
  const { maxWidth, advance } = options
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES
  if (!(maxWidth > 0) || !Number.isFinite(maxWidth)) throw new RangeError(`maxWidth must be positive, got ${maxWidth}`)
  if (!Number.isInteger(maxLines) || maxLines < 1)
    throw new RangeError(`maxLines must be a positive integer, got ${maxLines}`)

  if (text.replace(/\n+$/, '') === '') return []
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')) {
    lines.push(...wrapParagraph(paragraph, maxWidth, advance))
  }

  const pages: TextPage[] = []
  for (let i = 0; i < lines.length; i += maxLines) {
    const page = trimBlankEdges(lines.slice(i, i + maxLines))
    if (page.length > 0) pages.push({ lines: page })
  }
  return pages
}

/** Width of `text` on one line. */
export function measureText(text: string, advance: AdvanceFn): number {
  let width = 0
  for (const ch of text) width += ch === SOFT_HYPHEN || ch === ZERO_WIDTH_SPACE ? 0 : advance(ch)
  return width
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start] === '') start++
  while (end > start && lines[end - 1] === '') end--
  return lines.slice(start, end)
}

function toUnits(paragraph: string, advance: AdvanceFn): Unit[] {
  return Array.from(paragraph, (ch): Unit => {
    if (ch === ' ' || ch === '\t') return { ch: ' ', adv: advance(' '), kind: 'space' }
    if (ch === SOFT_HYPHEN) return { ch, adv: 0, kind: 'shy' }
    if (ch === ZERO_WIDTH_SPACE) return { ch, adv: 0, kind: 'zwsp' }
    return { ch, adv: advance(ch), kind: 'char' }
  })
}

function emit(units: Unit[], start: number, end: number, hyphen: boolean): string {
  let out = ''
  for (let i = start; i < end; i++) if (units[i].kind === 'char' || units[i].kind === 'space') out += units[i].ch
  return out.replace(/ +$/, '') + (hyphen ? HYPHEN : '')
}

function wrapParagraph(paragraph: string, maxWidth: number, advance: AdvanceFn): string[] {
  const units = toUnits(paragraph, advance)
  const hyphenAdv = advance(HYPHEN)
  const lines: string[] = []
  let start = 0
  let i = 0
  let width = 0
  let candidates: Candidate[] = []

  const startLine = (at: number): void => {
    i = at
    while (units[i]?.kind === 'space') i++
    start = i
    width = 0
    candidates = []
  }

  while (i < units.length) {
    const unit = units[i]
    if (unit.kind === 'space') {
      candidates.push({ end: i, next: i + 1, hyphen: false })
    } else if (unit.kind === 'zwsp') {
      candidates.push({ end: i, next: i + 1, hyphen: false })
    } else if (unit.kind === 'shy') {
      candidates.push({ end: i, next: i + 1, hyphen: true })
    } else if (width + unit.adv > maxWidth && i > start && hasContent(units, start, i)) {
      const cut = chooseBreak(units, start, i, candidates, width, maxWidth, hyphenAdv)
      lines.push(emit(units, start, cut.end, cut.hyphen))
      startLine(cut.next)
      continue
    }
    width += unit.adv
    i++
    if (unit.kind === 'char' && unit.ch === HYPHEN && LETTER_OR_DIGIT.test(units[i - 2]?.ch ?? '')) {
      candidates.push({ end: i, next: i, hyphen: false })
    }
  }
  lines.push(emit(units, start, units.length, false))
  return lines
}

function hasContent(units: Unit[], from: number, to: number): boolean {
  for (let k = from; k < to; k++) if (units[k].kind === 'char') return true
  return false
}

/** The latest break that fits, else a cut through the word at `i`. */
function chooseBreak(
  units: Unit[],
  start: number,
  i: number,
  candidates: readonly Candidate[],
  width: number,
  maxWidth: number,
  hyphenAdv: number,
): Candidate {
  for (let c = candidates.length - 1; c >= 0; c--) {
    const cand = candidates[c]
    if (!hasContent(units, start, cand.end)) continue
    const room = widthOf(units, start, cand.end) + (cand.hyphen ? hyphenAdv : 0)
    if (room <= maxWidth) return cand
  }
  let end = i
  let used = width
  const hyphenOk = (at: number): boolean => {
    const after = units.slice(at).find((u) => u.kind === 'char' || u.kind === 'space')
    let k = at - 1
    while (k > start && (units[k].kind === 'shy' || units[k].kind === 'zwsp')) k--
    return LETTER.test(units[k].ch) && LETTER.test(after?.ch ?? '')
  }
  if (hyphenOk(end)) {
    while (end - 1 > start && used + hyphenAdv > maxWidth) used -= units[--end].adv
    if (hyphenOk(end) && used + hyphenAdv <= maxWidth) return { end, next: end, hyphen: true }
    end = i
  }
  return { end, next: end, hyphen: false }
}

function widthOf(units: Unit[], from: number, to: number): number {
  let sum = 0
  let last = to
  while (last > from && units[last - 1].kind === 'space') last--
  for (let k = from; k < last; k++) sum += units[k].adv
  return sum
}
