/**
 * Languages a game can be written in, each named in itself (its
 * endonym): a child looking for their own language finds it spelled the
 * way they spell it, whatever language the editor runs in.
 *
 * Deliberately short and hand-written — the languages people ask for
 * first, not every locale there is. A code outside the list still works
 * everywhere (it shows as its code); the list only decides what the
 * "Add a language" picker offers.
 */
export interface LocaleName {
  /** Locale code, as stored in `ProjectLanguages`. */
  code: string
  /** The language's own name for itself. */
  endonym: string
}

export const LOCALE_NAMES: readonly LocaleName[] = [
  { code: 'ar', endonym: 'العربية' },
  { code: 'bg', endonym: 'Български' },
  { code: 'ca', endonym: 'Català' },
  { code: 'cs', endonym: 'Čeština' },
  { code: 'da', endonym: 'Dansk' },
  { code: 'de', endonym: 'Deutsch' },
  { code: 'el', endonym: 'Ελληνικά' },
  { code: 'en', endonym: 'English' },
  { code: 'es', endonym: 'Español' },
  { code: 'et', endonym: 'Eesti' },
  { code: 'fa', endonym: 'فارسی' },
  { code: 'fi', endonym: 'Suomi' },
  { code: 'fr', endonym: 'Français' },
  { code: 'he', endonym: 'עברית' },
  { code: 'hi', endonym: 'हिन्दी' },
  { code: 'hr', endonym: 'Hrvatski' },
  { code: 'hu', endonym: 'Magyar' },
  { code: 'id', endonym: 'Bahasa Indonesia' },
  { code: 'it', endonym: 'Italiano' },
  { code: 'ja', endonym: '日本語' },
  { code: 'ko', endonym: '한국어' },
  { code: 'lt', endonym: 'Lietuvių' },
  { code: 'lv', endonym: 'Latviešu' },
  { code: 'nb', endonym: 'Norsk bokmål' },
  { code: 'nl', endonym: 'Nederlands' },
  { code: 'pl', endonym: 'Polski' },
  { code: 'pt', endonym: 'Português' },
  { code: 'pt-BR', endonym: 'Português (Brasil)' },
  { code: 'ro', endonym: 'Română' },
  { code: 'ru', endonym: 'Русский' },
  { code: 'sk', endonym: 'Slovenčina' },
  { code: 'sl', endonym: 'Slovenščina' },
  { code: 'sr', endonym: 'Српски' },
  { code: 'sv', endonym: 'Svenska' },
  { code: 'th', endonym: 'ไทย' },
  { code: 'tr', endonym: 'Türkçe' },
  { code: 'uk', endonym: 'Українська' },
  { code: 'vi', endonym: 'Tiếng Việt' },
  { code: 'zh-Hans', endonym: '简体中文' },
  { code: 'zh-Hant', endonym: '繁體中文' },
]

/** What to call `code` in the UI: its endonym, else the code itself. */
export function localeLabel(code: string): string {
  return LOCALE_NAMES.find((l) => l.code === code)?.endonym ?? code
}

/** The picker's offer: every listed language not yet in the project, by endonym. */
export function localesToAdd(taken: readonly string[]): LocaleName[] {
  return LOCALE_NAMES.filter((l) => !taken.includes(l.code)).sort((a, b) => a.endonym.localeCompare(b.endonym))
}
