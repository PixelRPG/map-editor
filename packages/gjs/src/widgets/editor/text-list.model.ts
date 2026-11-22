import { DEFAULT_LANGUAGES, type LocalizedText, resolveText, withLocaleText } from '@pixelrpg/engine'

// Pure list reducers behind the list-of-texts row: GTK-free so the edit
// operations (add / remove / reorder / retype a line) are unit-testable.
// Each returns a new array and never touches its input.

/** The text a row shows: the project default language (the language picker is T6 / H5). */
export function lineText(text: LocalizedText | undefined): string {
  return resolveText(text, DEFAULT_LANGUAGES.default, DEFAULT_LANGUAGES.default)
}

/**
 * `text` with its default-language wording replaced. A plain string stays
 * plain; a per-language map keeps its other languages, so editing the
 * English never clobbers a translation.
 */
export function retype(text: LocalizedText | undefined, value: string): LocalizedText {
  return withLocaleText(text, DEFAULT_LANGUAGES.default, value, DEFAULT_LANGUAGES.default)
}

/** Append a blank line. Kept in the data while it is typed into; the game skips it. */
export function addLine(lines: readonly LocalizedText[]): LocalizedText[] {
  return [...lines, '']
}

export function removeLine(lines: readonly LocalizedText[], index: number): LocalizedText[] {
  return lines.filter((_line, i) => i !== index)
}

/** Replace line `index`'s wording; out of range is a no-op copy. */
export function setLine(lines: readonly LocalizedText[], index: number, value: string): LocalizedText[] {
  return lines.map((line, i) => (i === index ? retype(line, value) : line))
}

/** Move the line at `from` so it ends up at `to` (clamped); a no-op copy when out of range. */
export function moveLine(lines: readonly LocalizedText[], from: number, to: number): LocalizedText[] {
  const next = lines.slice()
  if (from < 0 || from >= next.length) return next
  const [line] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, line)
  return next
}
