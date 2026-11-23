import type { FlagValue } from './EntityDefinition.ts'

/** What a flag holds: a switch, a counter or a word. */
export const FLAG_KINDS = ['yes-no', 'number', 'text'] as const
export type FlagKind = (typeof FLAG_KINDS)[number]

/**
 * Whose memory a flag lives in. `'thing'` is stored and synced but the
 * runtime treats it like `'game'` until the world/player/thing split of
 * the "Remember" stage lands — see `docs/concepts/game-systems.md`.
 */
export const FLAG_SCOPES = ['game', 'thing'] as const
export type FlagScope = (typeof FLAG_SCOPES)[number]

/**
 * One named thing the game remembers ("Has the key", "Coins found"). A
 * project-level definition, referenced by `id` from `set-flag` actions
 * and `EntityState.when` conditions, so renaming never breaks a door.
 *
 * `name` is a plain string, not a `LocalizedText`: it is the label the
 * author sees in the editor's pickers and never reaches a player.
 */
export interface FlagData {
  /** Stable id (the key for references, edits and sync). Unique within the project. */
  id: string
  /** Editor-facing label. */
  name: string
  kind: FlagKind
  /** Value at the start of a playthrough; must match `kind`. */
  initial: FlagValue
  scope: FlagScope
}

export function isFlagKind(value: unknown): value is FlagKind {
  return typeof value === 'string' && (FLAG_KINDS as readonly string[]).includes(value)
}

export function isFlagScope(value: unknown): value is FlagScope {
  return typeof value === 'string' && (FLAG_SCOPES as readonly string[]).includes(value)
}

/** The value a fresh flag of `kind` starts with. */
export function defaultFlagInitial(kind: FlagKind): FlagValue {
  return kind === 'yes-no' ? false : kind === 'number' ? 0 : ''
}

/** Does `value` have the type a flag of `kind` holds? */
export function flagValueFitsKind(value: unknown, kind: FlagKind): boolean {
  if (kind === 'yes-no') return typeof value === 'boolean'
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === 'string'
}

/** The kind that fits a value an old project stored. */
export function flagKindOfValue(value: unknown): FlagKind {
  return typeof value === 'number' ? 'number' : typeof value === 'string' ? 'text' : 'yes-no'
}

/** Why `value` is not a valid {@link FlagData}, or `null` when it is. */
export function flagError(value: unknown): string | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return 'not an object'
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !FLAG_ID.test(v.id)) return 'id is required (letters, digits, - and _)'
  if (typeof v.name !== 'string' || v.name.trim().length === 0) return 'name is required'
  if (!isFlagKind(v.kind)) return `unknown kind "${String(v.kind)}"`
  if (!isFlagScope(v.scope)) return `unknown scope "${String(v.scope)}"`
  if (!flagValueFitsKind(v.initial, v.kind)) return `initial does not fit kind "${v.kind}"`
  return null
}

export function isFlagData(value: unknown): value is FlagData {
  return flagError(value) === null
}

/**
 * The entries of `list` that are valid, first occurrence of each id wins,
 * only the known fields copied — the same guard credits get, so a peer
 * cannot make the project unsaveable.
 */
export function sanitizeFlags(list: readonly unknown[]): FlagData[] {
  const seen = new Set<string>()
  const out: FlagData[] = []
  for (const item of list) {
    if (!isFlagData(item) || seen.has(item.id)) continue
    seen.add(item.id)
    out.push({ id: item.id, name: item.name, kind: item.kind, initial: item.initial, scope: item.scope })
  }
  return out
}

const FLAG_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** FNV-1a, 32 bit — a stable, dependency-free hash for ids. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * The id an old project's flag NAME becomes. Deterministic and
 * idempotent: a name that already looks like an id is kept as it is, any
 * other name becomes a readable slug plus a hash of the original, so two
 * names never share an id and a map can be rewritten without seeing the
 * project.
 */
export function flagIdFromName(name: string): string {
  if (FLAG_ID.test(name)) return name
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `${slug || 'flag'}-${fnv1a(name)}`
}

/** A new id for a flag called `name` that no entry of `list` uses. */
export function newFlagId(list: readonly FlagData[], name: string): string {
  const taken = new Set(list.map((f) => f.id))
  const base = flagIdFromName(name.trim() || 'flag')
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 58)}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
