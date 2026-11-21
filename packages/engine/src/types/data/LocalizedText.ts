/**
 * Authored game text: a plain string (one language, passes through
 * unchanged) or a map from locale code to the text in that language.
 * EVERY player-visible string in game data uses this type from its first
 * commit — it is about the game's own content, not the editor's gettext UI.
 */
export type LocalizedText = string | Readonly<Record<string, string>>

/** The languages a project is written in. `default` is the fallback for a missing translation. */
export interface ProjectLanguages {
  default: string
  others: string[]
}

/** What a project without a `languages` block means. */
export const DEFAULT_LANGUAGES: Readonly<ProjectLanguages> = { default: 'en', others: [] }

/** Short BCP-47-ish code: `en`, `de`, `pt-BR`, `zh-Hant-TW`. */
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

export function isLocaleCode(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_PATTERN.test(value)
}

/** Why `value` is not a valid {@link ProjectLanguages}, or `null` when it is. */
export function languagesError(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return 'not an object'
  const v = value as Record<string, unknown>
  if (!isLocaleCode(v.default)) return `invalid default locale "${String(v.default)}"`
  if (!Array.isArray(v.others)) return 'others must be an array'
  const seen = new Set<string>()
  for (const code of v.others) {
    if (!isLocaleCode(code)) return `invalid locale "${String(code)}"`
    if (code === v.default) return `default locale "${code}" must not be in others`
    if (seen.has(code)) return `duplicate locale "${code}"`
    seen.add(code)
  }
  return null
}

/** The project's languages, treating an absent block as English only. */
export function effectiveLanguages(languages: ProjectLanguages | undefined): ProjectLanguages {
  return languages ?? { default: DEFAULT_LANGUAGES.default, others: [] }
}

/** Every locale the project lists, default first. */
export function listedLocales(languages: ProjectLanguages | undefined): string[] {
  const l = effectiveLanguages(languages)
  return [l.default, ...l.others]
}

/** True for a string or a record of strings. */
export function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === 'string') return true
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

/**
 * The text to show for `locale`. A plain string passes through; for a
 * map: exact locale, then its bare language (`de-AT` → `de`), then
 * `fallback` (the project default), then the first entry, else `''`.
 */
export function resolveText(text: LocalizedText | undefined, locale: string, fallback: string): string {
  if (text === undefined) return ''
  if (typeof text === 'string') return text
  const language = locale.split('-')[0]
  for (const key of [locale, language, fallback]) {
    const hit = Object.hasOwn(text, key) ? text[key] : undefined
    if (hit !== undefined) return hit
  }
  return Object.values(text)[0] ?? ''
}

/**
 * `text` with `value` set for `locale`: a plain string stays plain when
 * edited in `fallback`, otherwise it becomes a map keeping the old text
 * under `fallback`.
 */
export function withLocaleText(
  text: LocalizedText | undefined,
  locale: string,
  value: string,
  fallback: string,
): LocalizedText {
  if (text === undefined || (typeof text === 'string' && locale === fallback)) return value
  const base: Record<string, string> = typeof text === 'string' ? { [fallback]: text } : { ...text }
  base[locale] = value
  return base
}

/** The locale codes a text spells out (none for a plain string). */
export function localesOfText(text: LocalizedText | undefined): string[] {
  return text !== undefined && typeof text === 'object' ? Object.keys(text) : []
}
