import { CREDIT_ROLES, type CreditEntry, isHttpUrl, type SpriteSetReference } from '@pixelrpg/engine'

/**
 * Starter packs — ready-made tilesets a child can add with one tap
 * (REDESIGN § 6.5). A pack is CONTENT: `games/starter-packs.json` names
 * it, points at a sprite set already in the repo and records the credit
 * the licence asks for. This module is the pure half — parsing that
 * file, deciding what a card shows, and merging the credit — so the rules
 * can be specced headlessly; the copy itself is `ProjectStore.addStarterPack`.
 *
 * Idempotency rule: a pack's id IS the id of the sprite set it adds and
 * of the credit it writes. Adding a pack that is already there changes
 * nothing, so a double tap, a peer who added it first and a project
 * made from `blank-starter` (which ships the first pack) all converge.
 */

export interface StarterPack {
  /** Stable id; also the id of the sprite set the pack adds to a project. */
  id: string
  /** Shown on the card. A proper noun, so it is not translated. */
  name: string
  /** Sprite-set descriptor, relative to the `games/` directory. */
  spriteSet: string
  /** Licence as it reads on the card, e.g. `CC0`. */
  license: string
  /** Written to the project's credits when the pack is added. */
  credit: CreditEntry
}

/** What a card offers, given what the project and the open map already hold. */
export type StarterPackState =
  /** Not in the project: a tap copies it in and puts it on the map. */
  | 'new'
  /** In the project, not on this map: a tap puts it on the map. */
  | 'attach'
  /** On this map: a tap just paints with it. */
  | 'added'

export interface StarterPackCardModel {
  id: string
  name: string
  license: string
  state: StarterPackState
}

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseCredit(raw: unknown): CreditEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = text(r.id)
  const name = text(r.name)
  const role = CREDIT_ROLES.find((candidate) => candidate === r.role)
  if (!id || !name || !role) return null
  const entry: CreditEntry = { id, role, name }
  const license = text(r.license)
  const url = text(r.url)
  if (license) entry.license = license
  if (url && isHttpUrl(url)) entry.url = url
  return entry
}

/** A path that stays inside `games/`: relative, no `..`, no backslash. */
function isContainedPath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..')
}

/**
 * The packs a catalogue file describes. An entry without a usable id,
 * name, path, licence or credit is dropped rather than shown half-made;
 * a repeated id keeps its first entry.
 */
export function parseStarterPacks(json: unknown): StarterPack[] {
  const list = (json as { packs?: unknown } | null)?.packs
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const packs: StarterPack[] = []
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const id = text(r.id)
    const name = text(r.name)
    const spriteSet = text(r.spriteSet)
    const license = text(r.license)
    const credit = parseCredit(r.credit)
    if (!PACK_ID.test(id) || seen.has(id) || !name || !license || !credit || !isContainedPath(spriteSet)) continue
    seen.add(id)
    packs.push({ id, name, spriteSet, license, credit })
  }
  return packs
}

/**
 * The shelf's cards. `mapSpriteSetIds` is `null` when no map is open,
 * where "in the project" is the best answer there is.
 */
export function shelfModel(
  packs: readonly StarterPack[],
  projectSpriteSetIds: ReadonlySet<string>,
  mapSpriteSetIds: ReadonlySet<string> | null,
): StarterPackCardModel[] {
  return packs.map(({ id, name, license }) => {
    const onMap = mapSpriteSetIds?.has(id) ?? projectSpriteSetIds.has(id)
    const state: StarterPackState = onMap ? 'added' : projectSpriteSetIds.has(id) ? 'attach' : 'new'
    return { id, name, license, state }
  })
}

/**
 * `list` with the pack's credit in it. The very same array comes back
 * when the credit is already there — by id, or by the same name and role
 * typed in by hand — so the caller can skip the write.
 */
export function mergePackCredit(list: readonly CreditEntry[], credit: CreditEntry): readonly CreditEntry[] {
  const name = credit.name.toLowerCase()
  const present = list.some((c) => c.id === credit.id || (c.role === credit.role && c.name.toLowerCase() === name))
  return present ? list : [...list, credit]
}

/**
 * The reference that puts sprite set `id` on a map: the project's
 * `firstGid` (already past every other set, so it cannot overlap one on
 * the map) with the path as a map file sees it.
 */
export function mapReferenceForSpriteSet(id: string, firstGid: number): SpriteSetReference {
  return { id, path: `../spritesets/${id}.json`, type: 'spriteset', firstGid }
}

/** `refs` plus `ref`; the same array when a reference to that set is already there. */
export function attachSpriteSetReference(
  refs: readonly SpriteSetReference[],
  ref: SpriteSetReference,
): readonly SpriteSetReference[] {
  return refs.some((r) => r.id === ref.id) ? refs : [...refs, ref]
}
