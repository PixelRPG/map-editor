/** The font every language falls back to; its glyphs are Latin. */
export const DEFAULT_FONT_ID = 'fusion-pixel-12'

/**
 * Fonts a language puts IN FRONT of the default, by lower-case language
 * (`ar`) or full tag (`zh-hant`). A script the default lacks adds its font
 * here; the default stays last, so Latin digits and names inside it still
 * draw.
 */
export type FontChainTable = Readonly<Record<string, readonly string[]>>

/** Nothing yet: every shipped language is covered by {@link DEFAULT_FONT_ID}. */
export const DEFAULT_FONT_CHAINS: FontChainTable = {}

/**
 * The fonts to try for `locale`, first match wins per character: the
 * full tag's entry, else its bare language's, then the default.
 */
export function resolveFontChain(locale: string, table: FontChainTable = DEFAULT_FONT_CHAINS): string[] {
  const tag = locale.toLowerCase()
  const language = tag.split('-')[0]
  const own = [tag, language].map((key) => (Object.hasOwn(table, key) ? table[key] : undefined)).find((v) => v)
  const chain = [...(own ?? []), DEFAULT_FONT_ID]
  return chain.filter((id, i) => chain.indexOf(id) === i)
}

/** The first font of `chain` that `covers` the code point, else the last one. */
export function fontForChar(
  chain: readonly string[],
  char: string,
  covers: (fontId: string, char: string) => boolean,
): string {
  return chain.find((id) => covers(id, char)) ?? chain[chain.length - 1]
}
