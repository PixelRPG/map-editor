import { Logger } from 'excalibur'
import { migrateProjectDialogue } from './migrate-dialogue'
import { validateEntityDefinition } from '../entity/validate'
import { unknownGameSystemIds } from '../game-systems/registry'
import type { GameProjectData } from '../types'
import { creditEntryError, isEntityDefinition, languagesError, listedLocales, localesOfText } from '../types/data/index'
import type { ActionData, LocalizedText } from '../types/data/index'

/** Every authored text of a definition: its components and those of its states (`show-text`, `ask`, `dialogue`). */
export function definitionTexts(def: {
  components?: readonly unknown[]
  states?: readonly { components?: readonly unknown[] }[]
}): LocalizedText[] {
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

// biome-ignore lint/complexity/noStaticOnlyClass: Used as a namespace for cohesive serializer/validator functions; conversion would break barrelsby's `export *` re-export pattern.
export class GameProjectFormat {
  /**
   * Validates game project data structure
   */
  static validate(data: GameProjectData): boolean {
    if (!data.version) {
      throw new Error('Game project version is required')
    }
    if (!data.id) {
      throw new Error('Game project id is required')
    }
    if (!data.name) {
      throw new Error('Game project name is required')
    }
    if (!data.startup?.initialMapId) {
      throw new Error('Game project startup configuration is required')
    }
    if (!Array.isArray(data.maps) || data.maps.length === 0) {
      throw new Error('Game project must have at least one map')
    }
    if (!Array.isArray(data.spriteSets)) {
      throw new Error('Game project spriteSets must be an array')
    }

    // Ensure all map references have the required properties
    data.maps.forEach((map) => {
      if (!map.id || !map.path || map.type !== 'map') {
        throw new Error('Invalid map reference')
      }
    })

    // Ensure all sprite set references have the required properties
    data.spriteSets.forEach((spriteSet) => {
      if (!spriteSet.id || !spriteSet.path || spriteSet.type !== 'spriteset') {
        throw new Error('Invalid sprite set reference')
      }
    })

    // Ensure map categories have required properties
    if (data.mapCategories) {
      data.mapCategories.forEach((category) => {
        if (!category.id || !category.name) {
          throw new Error('Map categories must have id and name')
        }
      })
    }

    // Validate that initialMapId exists in maps
    const initialMapExists = data.maps.some((map) => map.id === data.startup.initialMapId)
    if (!initialMapExists) {
      throw new Error(`Initial map with id '${data.startup.initialMapId}' not found in maps`)
    }

    // Validate the entity library — every entry must be a well-formed
    // EntityDefinition with registered component types. Optional field:
    // missing / empty array is fine.
    if (data.entityLibrary !== undefined) {
      if (!Array.isArray(data.entityLibrary)) {
        throw new Error('Game project entityLibrary must be an array')
      }
      const seenIds = new Set<string>()
      data.entityLibrary.forEach((def, index) => {
        if (!isEntityDefinition(def)) {
          throw new Error(`Invalid entity definition at entityLibrary[${index}]`)
        }
        const errors = validateEntityDefinition(def)
        if (errors.length > 0) {
          throw new Error(`Invalid entity definition "${def.id}" at entityLibrary[${index}]: ${errors[0]}`)
        }
        if (seenIds.has(def.id)) {
          throw new Error(`Duplicate entity definition id "${def.id}" in entityLibrary`)
        }
        seenIds.add(def.id)
      })
    }

    if (data.credits !== undefined) {
      if (!Array.isArray(data.credits)) {
        throw new Error('Game project credits must be an array')
      }
      const seenCreditIds = new Set<string>()
      data.credits.forEach((entry, index) => {
        const error = creditEntryError(entry)
        if (error) throw new Error(`Invalid credit at credits[${index}]: ${error}`)
        if (seenCreditIds.has(entry.id)) throw new Error(`Duplicate credit id "${entry.id}" in credits`)
        seenCreditIds.add(entry.id)
      })
    }

    if (data.languages !== undefined) {
      const error = languagesError(data.languages)
      if (error) throw new Error(`Invalid game project languages: ${error}`)
    }

    GameProjectFormat.reportUnlistedLocales(data)
    GameProjectFormat.reportUnknownGameSystems(data)

    return true
  }

  /**
   * Locales spelled out in the entity library's authored text that the
   * project's `languages` does not list. Sorted, unique.
   */
  static unlistedLocales(data: GameProjectData): string[] {
    const listed = new Set(listedLocales(data.languages))
    const found = new Set<string>()
    for (const def of data.entityLibrary ?? []) {
      for (const text of definitionTexts(def)) {
        for (const code of localesOfText(text)) if (!listed.has(code)) found.add(code)
      }
    }
    return [...found].sort()
  }

  /** Reported, never rejected: the text still resolves through the default-language fallback. */
  private static reportUnlistedLocales(data: GameProjectData): void {
    const unlisted = GameProjectFormat.unlistedLocales(data)
    if (unlisted.length === 0) return
    Logger.getInstance().warn(
      `[GameProjectFormat] game text uses locale(s) ${unlisted.map((c) => `"${c}"`).join(', ')} ` +
        "that the project's languages do not list — add them to languages.others.",
    )
  }

  /**
   * A project naming a game system this build does not have is REPORTED,
   * never rejected: a template downloaded from a newer editor must still
   * open, with that system's components dormant. Rejecting it here would
   * make forward compatibility a broken file; ignoring it silently would
   * make a typo indistinguishable from a newer feature.
   */
  private static reportUnknownGameSystems(data: GameProjectData): void {
    const unknown = unknownGameSystemIds(data)
    if (unknown.length === 0) return
    Logger.getInstance().warn(
      `[GameProjectFormat] project enables unknown game system(s) ${unknown.map((id) => `"${id}"`).join(', ')} — ` +
        'this editor does not have them installed. The project opens; their components stay dormant.',
    )
  }

  /**
   * Serializes game project data to JSON string
   */
  static serialize(data: GameProjectData): string {
    GameProjectFormat.validate(data)
    return JSON.stringify(data, null, 2)
  }

  /**
   * Deserializes JSON string to game project data
   */
  static deserialize(json: string): GameProjectData {
    const data = migrateProjectDialogue(JSON.parse(json) as GameProjectData)
    GameProjectFormat.validate(data)
    return data
  }
}
