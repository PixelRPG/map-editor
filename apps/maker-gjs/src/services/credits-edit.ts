import { type CreditEntry, type CreditRole, isHttpUrl } from '@pixelrpg/engine'

/**
 * Editing the project's credits list — pure, so the dialog and the page
 * stay thin and the rules can be specced headlessly.
 *
 * Every function returns a NEW list: the result goes whole into
 * `ProjectStore.setCredits` (`__project/credits.set`, which replaces the
 * list on every peer), and the list it replaced is the undo snapshot.
 */

/** What the edit dialog holds while it is open: plain text, nothing trusted yet. */
export interface CreditDraft {
  name: string
  role: CreditRole
  license: string
  url: string
}

/** What is wrong with a draft; both `false` means it can be saved. */
export interface CreditDraftProblems {
  nameMissing: boolean
  urlInvalid: boolean
}

/** A fresh draft for "Add someone": art is what most credits are. */
export function emptyCreditDraft(): CreditDraft {
  return { name: '', role: 'art', license: '', url: '' }
}

export function draftOfCredit(entry: CreditEntry): CreditDraft {
  return { name: entry.name, role: entry.role, license: entry.license ?? '', url: entry.url ?? '' }
}

export function creditDraftProblems(draft: CreditDraft): CreditDraftProblems {
  const url = draft.url.trim()
  return { nameMissing: draft.name.trim().length === 0, urlInvalid: url.length > 0 && !isHttpUrl(url) }
}

/** The entry a valid draft stands for; empty optional fields are left out. */
export function creditFromDraft(draft: CreditDraft, id: string): CreditEntry {
  const entry: CreditEntry = { id, role: draft.role, name: draft.name.trim() }
  const license = draft.license.trim()
  const url = draft.url.trim()
  if (license) entry.license = license
  if (url) entry.url = url
  return entry
}

/**
 * `url` when it may be opened, else `null`. The one place a link button
 * asks: a url that arrived from a peer is no more trusted than a typed one.
 */
export function safeCreditUrl(url: string | undefined): string | null {
  return url !== undefined && isHttpUrl(url) ? url : null
}

/** An id no entry of `list` uses. `random` is injectable for the spec. */
export function newCreditId(list: readonly CreditEntry[], random: () => number = Math.random): string {
  const taken = new Set(list.map((c) => c.id))
  for (;;) {
    const id = `credit-${random().toString(36).slice(2, 8)}`
    if (id.length > 'credit-'.length && !taken.has(id)) return id
  }
}

export function addCredit(list: readonly CreditEntry[], entry: CreditEntry): CreditEntry[] {
  return [...list, entry]
}

/**
 * Swap the entry with `entry.id` in place. When a peer removed it while
 * the dialog was open the edit is kept as a new line rather than lost.
 */
export function replaceCredit(list: readonly CreditEntry[], entry: CreditEntry): CreditEntry[] {
  if (!list.some((c) => c.id === entry.id)) return [...list, entry]
  return list.map((c) => (c.id === entry.id ? entry : c))
}

/** The outcome of a remove: the new list, and the one that puts it back. */
export interface CreditRemoval {
  next: CreditEntry[]
  /** The list as it was, for the Undo toast to write back. */
  previous: CreditEntry[]
}

/** Drop `id`; `null` when it is not in the list (nothing to remove, nothing to undo). */
export function removeCredit(list: readonly CreditEntry[], id: string): CreditRemoval | null {
  if (!list.some((c) => c.id === id)) return null
  return { next: list.filter((c) => c.id !== id), previous: [...list] }
}
