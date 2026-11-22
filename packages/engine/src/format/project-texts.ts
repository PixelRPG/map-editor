import type { ActionData, GameProjectData, LocalizedText, MapData } from '../types'
import { effectiveLanguages, listedLocales, localesOfText, resolveText } from '../types/data/index'

/** What carries authored components: a library entry, a placement's inline definition, a placement's overrides. */
interface TextSource {
  components?: readonly unknown[]
  states?: readonly { components?: readonly unknown[] }[]
}

/** Every authored text of a definition: its components and those of its states (`show-text`, `ask`, `dialogue`). */
export function definitionTexts(def: TextSource): LocalizedText[] {
  const texts: LocalizedText[] = []
  const visit = (list: readonly ActionData[]): void => {
    for (const action of list) {
      if (action?.type === 'show-text')
        texts.push(action.text, ...(action.speaker === undefined ? [] : [action.speaker]))
      else if (action?.type === 'ask') {
        texts.push(action.prompt)
        for (const option of action.options ?? []) {
          texts.push(option.label)
          visit(option.actions ?? [])
        }
      }
    }
  }
  const scan = (components: readonly unknown[] | undefined): void => {
    for (const c of components ?? []) {
      const component = c as { type?: string; actions?: unknown; lines?: unknown; speaker?: LocalizedText }
      if (component.type === 'actions' && Array.isArray(component.actions)) visit(component.actions as ActionData[])
      else if (component.type === 'dialogue') {
        if (Array.isArray(component.lines)) texts.push(...(component.lines as LocalizedText[]))
        if (component.speaker !== undefined) texts.push(component.speaker)
      }
    }
  }
  scan(def.components)
  for (const state of def.states ?? []) scan(state.components)
  return texts
}

/**
 * Every authored text of the project: the entity library plus every
 * placement on `maps` (an inline definition, or the components of an
 * override). THE one collector — the missing-text count and the
 * unlisted-locale warning both read it, so they cannot disagree about
 * what counts as a text.
 */
export function projectTexts(data: GameProjectData, maps: readonly MapData[] = []): LocalizedText[] {
  const texts: LocalizedText[] = []
  for (const def of data.entityLibrary ?? []) texts.push(...definitionTexts(def))
  for (const map of maps) {
    for (const placement of map.objectPlacements ?? []) {
      if (placement.inline) texts.push(...definitionTexts(placement.inline))
      if (placement.overrides) texts.push(...definitionTexts(placement.overrides))
    }
  }
  return texts
}

/** Locales some text spells out that the project does not list. Sorted, unique. */
export function unlistedLocalesOf(data: GameProjectData, maps: readonly MapData[] = []): string[] {
  const listed = new Set(listedLocales(data.languages))
  const found = new Set<string>()
  for (const text of projectTexts(data, maps)) {
    for (const code of localesOfText(text)) if (!listed.has(code)) found.add(code)
  }
  return [...found].sort()
}

/**
 * Whether `text` has nothing in `locale` yet. A plain string is written
 * in the default language only; an empty entry is still missing. A text
 * that is empty in the default language has nothing to translate.
 */
export function isTextMissing(text: LocalizedText, locale: string, fallback: string): boolean {
  if (resolveText(text, fallback, fallback) === '') return false
  if (typeof text === 'string') return locale !== fallback
  return !Object.hasOwn(text, locale) || text[locale] === ''
}

/** How many authored texts have no wording in `locale` yet. Never blocking — the default shows instead. */
export function missingTextCount(data: GameProjectData, maps: readonly MapData[], locale: string): number {
  const { default: fallback } = effectiveLanguages(data.languages)
  if (locale === fallback) return 0
  let count = 0
  for (const text of projectTexts(data, maps)) if (isTextMissing(text, locale, fallback)) count += 1
  return count
}

/** Whether the project has any authored text at all in `locale` (drives the "remove this language?" confirm). */
export function hasTextIn(data: GameProjectData, maps: readonly MapData[], locale: string): boolean {
  return projectTexts(data, maps).some((t) => typeof t === 'object' && (t[locale] ?? '') !== '')
}
