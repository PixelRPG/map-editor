/**
 * What the "New thing" dialog's second page starts from and what it
 * means when the person leaves it alone (REDESIGN.md § 6.6).
 *
 * Pure on purpose: the dialog is a throwaway form built imperatively,
 * and the naming rule is the only part of it worth a test.
 */

/**
 * The name a fresh thing is offered: the template's label, stepping to
 * `Chest 2`, `Chest 3` … while the library already holds that name.
 *
 * Two chests both called "Chest" is the one outcome the gallery cannot
 * render apart — the rows carry no id — and the dialog's name page
 * exists so the name is a choice, so it should open on a choice that is
 * already right. Stepping starts at 2 rather than at the library's size
 * like `nextMapName`, because a thing is named after its kind and not
 * numbered in sequence: the second chest in a project of forty things is
 * "Chest 2", not "Chest 41".
 *
 * `label` arrives translated — the suggestion is what the person reads.
 */
export function nextThingName(label: string, existingNames: readonly string[]): string {
  const base = label.trim()
  if (!base) return ''
  const taken = new Set(existingNames.map((name) => name.trim()))
  let name = base
  let n = 2
  while (taken.has(name)) name = `${base} ${n++}`
  return name
}

/**
 * What the name field means once "Create" is pressed. Whitespace does
 * not name anything, so a blank entry keeps the suggestion the field
 * opened with rather than creating a thing whose gallery row would fall
 * back to its generated id.
 */
export function resolveThingName(typed: string, suggestion: string): string {
  return typed.trim() || suggestion.trim()
}
