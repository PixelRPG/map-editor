import {
  DEFAULT_LANGUAGES,
  effectiveLanguages,
  listedLocales,
  type LocalizedText,
  localesOfText,
  type ProjectLanguages,
  resolveText,
  withLocaleText,
} from '@pixelrpg/engine'

// Which language a text row is writing in — GTK-free so the rules are
// unit-testable. The default language is the fallback: a translation
// that is not written yet shows the default wording as a hint.

/** What one text row shows for `locale`: its own wording and the hint behind it. */
export function textShown(
  text: LocalizedText | undefined,
  locale: string,
  fallback: string,
): { value: string; hint: string } {
  const hint = resolveText(text, fallback, fallback)
  if (locale === fallback) return { value: hint, hint: '' }
  const own = localesOfText(text).includes(locale) ? resolveText(text, locale, fallback) : ''
  return { value: own, hint }
}

/**
 * `text` after the row wrote `value` in `locale`. Emptying a translation
 * removes it (so it counts as missing again); the default language keeps
 * an empty string, as a single-language project always did.
 */
export function textWritten(
  text: LocalizedText | undefined,
  locale: string,
  fallback: string,
  value: string,
): LocalizedText {
  if (locale !== fallback && value === '') {
    if (text === undefined || typeof text === 'string') return text ?? ''
    const { [locale]: _dropped, ...rest } = text
    return rest
  }
  return withLocaleText(text, locale, value, fallback)
}

/**
 * The language the text rows of ONE editor are writing in. Shared by
 * every row of that editor, so switching on one row switches them all.
 * Rows register a refresh callback; the editor clears them when it
 * rebuilds its rows.
 */
export class TextLanguageState {
  languages: ProjectLanguages = { ...DEFAULT_LANGUAGES, others: [] }
  locale: string = DEFAULT_LANGUAGES.default
  private readonly _rows = new Set<() => void>()

  /** More than one language: only then does a text row offer the switch. */
  get multi(): boolean {
    return this.languages.others.length > 0
  }

  get fallback(): string {
    return this.languages.default
  }

  setLanguages(languages: ProjectLanguages | undefined): void {
    this.languages = effectiveLanguages(languages)
    if (!listedLocales(this.languages).includes(this.locale)) this.locale = this.languages.default
  }

  /** The next language in the list, wrapping round; refreshes every registered row. */
  cycle(): void {
    const all = listedLocales(this.languages)
    this.locale = all[(all.indexOf(this.locale) + 1) % all.length] ?? this.languages.default
    this.refreshAll()
  }

  /** Re-render every registered row (the data changed under them). */
  refreshAll(): void {
    for (const refresh of [...this._rows]) refresh()
  }

  /** Register a row's refresh; returns the way to unregister it. */
  track(refresh: () => void): () => void {
    this._rows.add(refresh)
    return () => this._rows.delete(refresh)
  }

  /** Forget every row (the editor is about to rebuild them). */
  reset(): void {
    this._rows.clear()
  }
}
