import type { EntityDefinition } from '@pixelrpg/engine'

/**
 * How the Library's Things page groups the entity library: by
 * `EntityDefinition.editorData.category`.
 *
 * The field has been in the type since the composition model landed
 * and had exactly one writer (promoting a thing into the cast stamps
 * `'npc'`; `characterToEntity` stamps the character's role) and no
 * reader at all. This is the reader. A thing without a category is an
 * **Object** — the word survives as the name of that one group, the
 * things you place: chests, signs, doors, triggers.
 *
 * Pure: the view renders one `Adw.PreferencesGroup` per returned group.
 */
export interface ThingGroup {
  /** The raw category key, or `OBJECTS_CATEGORY` for the uncategorised group. */
  readonly key: string
  /** The group heading, already a UI word. */
  readonly label: string
  readonly things: readonly EntityDefinition[]
}

/** The key of the uncategorised group — never stored on an entity. */
export const OBJECTS_CATEGORY = 'object'

/**
 * Group order and headings for the categories the editor writes itself.
 * Objects first: it is what the Things page is for, and the character
 * roles have a chip of their own. Any other key (a game system's, a
 * migrated project's) comes after, alphabetically, capitalised.
 */
const KNOWN_GROUPS: ReadonlyArray<readonly [key: string, label: string]> = [
  [OBJECTS_CATEGORY, 'Objects'],
  ['hero', 'Heroes'],
  ['npc', 'NPCs'],
]

/** The category an entity groups under. */
export function thingCategory(thing: EntityDefinition): string {
  const category = thing.editorData?.category?.trim()
  return category ? category : OBJECTS_CATEGORY
}

/** A heading for a category key the editor did not write. */
function labelForUnknown(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/**
 * Group `things` by category, dropping empty groups. Within a group the
 * library's own order is kept, so a grouped list reads like the flat
 * one did.
 */
export function groupThingsByCategory(things: readonly EntityDefinition[]): ThingGroup[] {
  const byKey = new Map<string, EntityDefinition[]>()
  for (const thing of things) {
    const key = thingCategory(thing)
    const bucket = byKey.get(key)
    if (bucket) bucket.push(thing)
    else byKey.set(key, [thing])
  }

  const groups: ThingGroup[] = []
  for (const [key, label] of KNOWN_GROUPS) {
    const bucket = byKey.get(key)
    if (bucket) groups.push({ key, label, things: bucket })
    byKey.delete(key)
  }
  const rest = [...byKey.keys()].sort((a, b) => a.localeCompare(b))
  for (const key of rest) groups.push({ key, label: labelForUnknown(key), things: byKey.get(key) ?? [] })
  return groups
}
