/**
 * What a credited contributor did. A CLOSED set on purpose: the UI shows a
 * translated label per role (a free string could not be translated) and the
 * validator can reject typos instead of storing them.
 */
export const CREDIT_ROLES = ['art', 'sound', 'music', 'story', 'code', 'other'] as const

export type CreditRole = (typeof CREDIT_ROLES)[number]

/**
 * One line of a project's credits — who made what, under which licence.
 * Stored in `GameProjectData.credits`.
 */
export interface CreditEntry {
  /** Stable id (the key for edits and sync). Unique within the list. */
  id: string
  role: CreditRole
  /** Person, studio or project being credited, and what they made. */
  name: string
  /** Licence name, e.g. `CC0` or `CC BY 4.0`. */
  license?: string
  /** Source page. Only `http:` / `https:` URLs are valid. */
  url?: string
}

export function isCreditRole(value: unknown): value is CreditRole {
  return typeof value === 'string' && (CREDIT_ROLES as readonly string[]).includes(value)
}

/** True when `value` parses as an `http:` or `https:` URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Why `value` is not a valid {@link CreditEntry}, or `null` when it is. */
export function creditEntryError(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return 'not an object'
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0) return 'id is required'
  if (!isCreditRole(v.role)) return `unknown role "${String(v.role)}"`
  if (typeof v.name !== 'string' || v.name.trim().length === 0) return 'name is required'
  if (v.license !== undefined && typeof v.license !== 'string') return 'license must be a string'
  if (v.url !== undefined && (typeof v.url !== 'string' || !isHttpUrl(v.url))) return 'url must be an http(s) URL'
  return null
}

export function isCreditEntry(value: unknown): value is CreditEntry {
  return creditEntryError(value) === null
}

/**
 * The entries of `list` that are valid, first occurrence of each id wins.
 * Used where a peer's data must not be able to make the project unsaveable:
 * an invalid entry is dropped rather than trusted, and only the known
 * fields are copied so extra keys never reach the project file.
 */
export function sanitizeCredits(list: readonly unknown[]): CreditEntry[] {
  const seen = new Set<string>()
  const out: CreditEntry[] = []
  for (const item of list) {
    if (!isCreditEntry(item) || seen.has(item.id)) continue
    seen.add(item.id)
    const entry: CreditEntry = { id: item.id, role: item.role, name: item.name }
    if (item.license !== undefined) entry.license = item.license
    if (item.url !== undefined) entry.url = item.url
    out.push(entry)
  }
  return out
}
