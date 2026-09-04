import { REQUIRED_ROLES, type SpriteSetData, type SpriteSetReference } from '@pixelrpg/engine'

/**
 * Pure sprite-set data transforms behind `ProjectStore`'s sprite-set
 * CRUD — id allocation, gid allocation, descriptor shaping and
 * reference ordering. gi-free (no GLib, no file IO) so they unit-test
 * under the node target; the store keeps the IO, broadcast and event
 * ordering.
 */

/** Default per-frame duration (ms) seeded into a new character sheet's animations. */
const DEFAULT_ANIMATION_MS = 200
/** Default frame index seeded into every required animation role. */
const DEFAULT_FRAME = 0

/**
 * Lowest unused id derived from `name` (`hero`, `hero-2`, `hero-3`, …).
 * Falls back to `fallback` when the name slugs to nothing.
 */
export function uniqueIdFrom(name: string, taken: ReadonlySet<string>, fallback = 'item'): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

/**
 * Next non-overlapping `firstGid` for a new sprite set: one past the
 * highest global tile id any existing set occupies. Keeps the imported
 * set usable as a tileset later without gid collisions. `spriteCountOf`
 * resolves how many sprites a referenced set holds (0 when it isn't
 * loaded yet).
 */
export function nextFirstGid(references: readonly SpriteSetReference[], spriteCountOf: (id: string) => number): number {
  let next = 1
  for (const ref of references) {
    const start = typeof ref.firstGid === 'number' ? ref.firstGid : next
    next = Math.max(next, start + spriteCountOf(ref.id))
  }
  return next
}

/**
 * Repoint a descriptor's image at `imageFile` (a descriptor-relative
 * filename), preserving the rest of the image reference. Used on both
 * import and peer-add, where the image lands at a filename WE derive
 * from the vetted set id rather than whatever path the source carried.
 */
export function withImagePath(data: SpriteSetData, imageFile: string): SpriteSetData {
  return { ...data, image: { ...(data.image ?? { id: 'main', type: 'image' as const }), path: imageFile } }
}

/**
 * Finalise a freshly-imported sprite set: take the project-unique `id`,
 * pin the image filename, default the kind to `tileset`, and — for a
 * character sheet — seed the required animation roles with a single
 * placeholder frame so a character using the sheet can animate
 * immediately (the user refines frames in the sheet's editor).
 */
export function buildImportedSpriteSetData(data: SpriteSetData, id: string, imageFile: string): SpriteSetData {
  const kind = data.kind ?? ('tileset' as const)
  return {
    ...withImagePath(data, imageFile),
    id,
    kind,
    characterAnimations:
      kind === 'character'
        ? (data.characterAnimations ??
          REQUIRED_ROLES.map((role) => ({
            id: role,
            frames: [{ spriteId: DEFAULT_FRAME, duration: DEFAULT_ANIMATION_MS }],
          })))
        : undefined,
  }
}

/**
 * Reorder `references` to match `orderedIds` (the Sheets gallery's
 * display order after a drag). References whose id isn't in the list
 * keep their relative order at the end (stable). Returns `null` when
 * the order is already current, so the caller can skip the persist.
 */
export function orderSpriteSetReferences(
  references: readonly SpriteSetReference[],
  orderedIds: readonly string[],
): SpriteSetReference[] | null {
  const rank = (id: string): number => {
    const i = orderedIds.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const sorted = [...references].sort((a, b) => rank(a.id) - rank(b.id))
  return sorted.every((ref, i) => ref === references[i]) ? null : sorted
}

/**
 * Set or clear a sprite's surface kind in place. Clearing drops
 * `tileProperties` entirely once it holds nothing else, so an untouched
 * tile serialises the same as one whose surface was set and unset again.
 */
export function writeTileSurface(def: SpriteSetData['sprites'][number], surface: string | null): void {
  if (surface) {
    def.tileProperties = { ...(def.tileProperties ?? {}), surface }
    return
  }
  if (def.tileProperties?.surface === undefined) return
  const next = { ...def.tileProperties }
  delete next.surface
  def.tileProperties = Object.keys(next).length === 0 ? undefined : next
}
