// Pure connection model behind the atlas's door lines: which two doors
// are the two ends of ONE passage, which lead one way only, and which
// lead nowhere at all. GTK-free so it can be unit-tested (the overlay
// that consumes it subclasses `Gtk.Widget`), which also means no
// gettext in here — the caller owns every translated string.

/**
 * One door as the model reads it — `SampleTeleport` satisfies it.
 *
 * `from` + `fx` / `fy` is where the door *sits*; `to` + `tx` / `ty` is
 * where the hero *arrives*. A `to` of `null` is a door whose target
 * does not resolve (none authored, or a map that is gone) — the loader
 * nulls it rather than dropping the door, so the atlas can say so.
 */
export interface DoorLink {
  from: string
  fx: number
  fy: number
  to: string | null
  tx: number
  ty: number
  label: string
}

/** One end of a drawn connection: a tile on a map. */
export interface ConnectionEnd {
  mapId: string
  tileX: number
  tileY: number
}

/**
 * How a connection reads on the atlas (REDESIGN.md § 6.2):
 * - `pair` — a door and its way back, drawn as ONE solid line with a
 *   door glyph at both ends,
 * - `one-way` — dashed, with an arrowhead at the arrival end,
 * - `broken` — a short red stub, because there is no far end to reach.
 */
export type MapConnectionKind = 'pair' | 'one-way' | 'broken'

/** One line on the atlas. */
export interface MapConnection {
  kind: MapConnectionKind
  /** The door this connection is drawn FROM — always a real door tile. */
  from: ConnectionEnd
  /**
   * The far end: the partner door's own tile for a pair, the arrival
   * tile for a one-way, `null` for a broken door.
   */
  to: ConnectionEnd | null
  label: string
  /**
   * Indices into the input door list, ascending — two for a pair, one
   * otherwise. The line's popover acts on the doors, not on the line.
   */
  doors: readonly number[]
}

/**
 * How far an arrival tile may sit from the door it is paired with, in
 * tiles (Chebyshev, so diagonals count as one).
 *
 * Not zero: a zelda-like puts the arrival tile *in front of* the door
 * rather than on it, so a real pair of doors never shares a tile and an
 * exact match would pair nothing at all. One tile is what "you land at
 * that door" means on a tile grid; two would start pairing a door with
 * its neighbour.
 */
export const PAIR_TILE_SLACK = 1

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

function endOf(mapId: string, tileX: number, tileY: number): ConnectionEnd {
  return { mapId, tileX, tileY }
}

/**
 * Total tile distance between two doors that are each other's way back,
 * or `null` when they are not a pair at all.
 *
 * Both halves have to hold: `a` must lead to `b`'s map and land at (or
 * next to) `b`'s tile, and `b` the same back to `a`. Two doors between
 * the same two maps that land somewhere else entirely are two separate
 * one-way passages, which is also what the author built.
 */
export function pairDistance(a: DoorLink, b: DoorLink): number | null {
  if (a.to === null || b.to === null) return null
  if (a.from !== b.to || a.to !== b.from) return null
  const aToB = chebyshev(a.tx, a.ty, b.fx, b.fy)
  const bToA = chebyshev(b.tx, b.ty, a.fx, a.fy)
  if (aToB > PAIR_TILE_SLACK || bToA > PAIR_TILE_SLACK) return null
  return aToB + bToA
}

/**
 * Fold a flat door list into the lines the atlas draws, merging each
 * door with its way back.
 *
 * Pairing is greedy over the closest candidates first, so when several
 * doors on one map could all claim the same door back — two adjacent
 * cave mouths leading to the same tile, which `games/zelda-like` really
 * has — the tightest fit wins and the rest stay one-way. Ties fall back
 * to input order, which makes the output deterministic: every peer
 * folding the same project draws the same lines.
 *
 * The connection is emitted at the position of its LOWER door index, so
 * the result's order follows the input.
 */
export function pairDoors(doors: readonly DoorLink[]): MapConnection[] {
  const candidates: Array<{ i: number; j: number; distance: number }> = []
  for (let i = 0; i < doors.length; i++) {
    for (let j = i + 1; j < doors.length; j++) {
      const distance = pairDistance(doors[i], doors[j])
      if (distance !== null) candidates.push({ i, j, distance })
    }
  }
  candidates.sort((l, r) => l.distance - r.distance || l.i - r.i || l.j - r.j)

  const partner = new Map<number, number>()
  for (const { i, j } of candidates) {
    if (partner.has(i) || partner.has(j)) continue
    partner.set(i, j)
    partner.set(j, i)
  }

  const connections: MapConnection[] = []
  doors.forEach((door, index) => {
    const from = endOf(door.from, door.fx, door.fy)
    const mateIndex = partner.get(index)
    if (mateIndex !== undefined) {
      // The lower index owns the shared line.
      if (mateIndex < index) return
      const mate = doors[mateIndex]
      connections.push({
        kind: 'pair',
        from,
        to: endOf(mate.from, mate.fx, mate.fy),
        label: door.label || mate.label,
        doors: [index, mateIndex],
      })
      return
    }
    if (door.to === null) {
      connections.push({ kind: 'broken', from, to: null, label: door.label, doors: [index] })
      return
    }
    connections.push({ kind: 'one-way', from, to: endOf(door.to, door.tx, door.ty), label: door.label, doors: [index] })
  })
  return connections
}

/** Whether `mapId` is at either end of `connection`. */
export function connectionTouches(connection: MapConnection, mapId: string): boolean {
  return connection.from.mapId === mapId || connection.to?.mapId === mapId
}

/**
 * Order-independent key for the pair of maps a connection runs between,
 * so the lines between the same two cards can be fanned apart instead
 * of drawn on top of each other. A broken door keys on its own map
 * alone.
 */
export function mapPairKey(connection: MapConnection): string {
  const a = connection.from.mapId
  const b = connection.to?.mapId ?? ''
  return a <= b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

/**
 * Group index of every connection within its {@link mapPairKey} group,
 * plus each group's size — the two numbers a fan needs. Positionally
 * aligned with `connections`.
 */
export function fanGroups(connections: readonly MapConnection[]): Array<{ index: number; count: number }> {
  const seen = new Map<string, number[]>()
  connections.forEach((connection, at) => {
    const key = mapPairKey(connection)
    const bucket = seen.get(key)
    if (bucket) bucket.push(at)
    else seen.set(key, [at])
  })
  const out: Array<{ index: number; count: number }> = connections.map(() => ({ index: 0, count: 1 }))
  for (const bucket of seen.values()) {
    bucket.forEach((at, index) => {
      out[at] = { index, count: bucket.length }
    })
  }
  return out
}
