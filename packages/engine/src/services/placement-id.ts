/**
 * Stable, unique id for a freshly-placed object.
 *
 * The id encodes the tile coords for readability and appends a
 * process-monotonic counter plus random entropy for uniqueness. It is
 * minted exactly once on the originating peer and carried verbatim in
 * the {@link PlaceObjectCommand} payload (a transport stable-key), so
 * the counter never has to agree across peers — it only has to make
 * two placements minted in the SAME session unique, which the prior
 * coords-plus-6-char-random form did not strictly guarantee (two
 * objects on the same tile differed by random alone). The random
 * suffix keeps cross-process / cross-peer collisions astronomically
 * unlikely.
 */
let placementCounter = 0

export function makePlacementId(tileX: number, tileY: number): string {
  // Wrap to an unsigned 32-bit range so the base36 suffix stays short
  // across a very long session; collisions after 2^32 placements are
  // covered by the random tail anyway.
  placementCounter = (placementCounter + 1) >>> 0
  const counter = placementCounter.toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `obj_${tileX}_${tileY}_${counter}${random}`
}
