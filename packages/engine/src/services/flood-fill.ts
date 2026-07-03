/**
 * Pure 4-connected flood-fill region search — the algorithmic core of
 * the bucket-fill (`'fill'`) tool, extracted from `TileEditorSystem` so
 * it can be unit-tested without a live scene / tilemap.
 *
 * The caller supplies a `signatureAt(x, y)` that maps a cell to a
 * stable string identity (e.g. the ordered sprite refs on the active
 * layer). The search returns every cell reachable from `origin` via
 * horizontal/vertical steps whose signature equals the origin's — i.e.
 * the contiguous same-tile region the user clicked into.
 */

export interface GridBounds {
  columns: number
  rows: number
}

export interface GridCell {
  x: number
  y: number
}

/**
 * Compute the contiguous 4-connected region of cells whose
 * `signatureAt` equals the origin cell's signature.
 *
 * - The origin is always included (index 0) when it is in bounds.
 * - Diagonally-adjacent cells are **not** connected (4-connectivity).
 * - Bounded by `columns × rows`; out-of-bounds neighbours are ignored,
 *   which is also the natural cap on the returned region size.
 *
 * Returns cells in traversal order. Returns an empty array when the
 * origin is out of bounds.
 */
export function computeFloodFillRegion(
  origin: GridCell,
  bounds: GridBounds,
  signatureAt: (x: number, y: number) => string,
): GridCell[] {
  const { columns, rows } = bounds
  if (origin.x < 0 || origin.y < 0 || origin.x >= columns || origin.y >= rows) return []

  const targetSignature = signatureAt(origin.x, origin.y)
  const region: GridCell[] = []
  const visited = new Set<string>()
  const stack: GridCell[] = [origin]
  const cap = columns * rows

  while (stack.length > 0 && region.length < cap) {
    const cell = stack.pop() as GridCell
    const { x, y } = cell
    if (x < 0 || y < 0 || x >= columns || y >= rows) continue
    const key = `${x},${y}`
    if (visited.has(key)) continue
    visited.add(key)
    if (signatureAt(x, y) !== targetSignature) continue
    region.push({ x, y })
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 })
  }

  return region
}
