import { type ProjectLanguages, isLocaleCode } from '@pixelrpg/engine'

/**
 * Editing the project's languages — pure, so the page stays thin and
 * the rules can be specced headlessly. Every function returns a NEW
 * value that goes whole into `ProjectStore.setLanguages`
 * (`__project/languages.set`); the value it replaced is the undo step.
 */

/** `code` added as another language; `null` when it is invalid or already there. */
export function addLanguage(languages: ProjectLanguages, code: string): ProjectLanguages | null {
  if (!isLocaleCode(code) || code === languages.default || languages.others.includes(code)) return null
  return { default: languages.default, others: [...languages.others, code] }
}

/** `code` dropped; `null` for the default language (it is the fallback) or an unknown code. */
export function removeLanguage(languages: ProjectLanguages, code: string): ProjectLanguages | null {
  if (!languages.others.includes(code)) return null
  return { default: languages.default, others: languages.others.filter((c) => c !== code) }
}

/** `code` as the default; the old default stays in the list, first. `null` when unknown or already the default. */
export function makeDefaultLanguage(languages: ProjectLanguages, code: string): ProjectLanguages | null {
  if (!languages.others.includes(code)) return null
  return { default: code, others: [languages.default, ...languages.others.filter((c) => c !== code)] }
}
