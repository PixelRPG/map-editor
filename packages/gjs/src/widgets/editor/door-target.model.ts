// Pure model behind the REDESIGN § 6.2 "Goes to" flow: what a door's
// teleport currently says, what it should say once the user has picked
// an arrival tile, and where the optional door back goes. GTK-free so it
// can be unit-tested, which also means no gettext in here — the caller
// owns every translated string.

/** Which way the hero faces on arrival. Mirrors the engine's `Facing`. */
export type DoorFacing = 'up' | 'down' | 'left' | 'right'

/** A tile on some map. */
export interface Tile {
  x: number
  y: number
}

/** A map's tile dimensions, used only to keep a door back on the map. */
export interface MapBounds {
  columns: number
  rows: number
}

/**
 * A door's teleport as the model reads it — the `type: 'teleport'`
 * component data of a placement, with everything optional because a
 * freshly placed Door from the library carries none of it yet.
 */
export interface DoorTeleport {
  targetMapId?: string
  targetTileX?: number
  targetTileY?: number
  facing?: DoorFacing
  label?: string
}

/** Minimal shape of one component entry on a definition. */
export interface ComponentEntry {
  type: string
  [key: string]: unknown
}

/**
 * The teleport component of a definition's component list, or `null`
 * when it carries none — which is how the caller decides whether a
 * placement is a door at all.
 */
export function readDoorTeleport(components: readonly ComponentEntry[] | undefined): DoorTeleport | null {
  const entry = components?.find((component) => component.type === 'teleport')
  if (!entry) return null
  const { targetMapId, targetTileX, targetTileY, facing, label } = entry as DoorTeleport & ComponentEntry
  return { targetMapId, targetTileX, targetTileY, facing, label }
}

/**
 * What the "Goes to" row has to say, as structure rather than text:
 *
 * - `unset` — the door names no map yet ("Nowhere yet"),
 * - `broken` — it names a map the project does not have, which is the
 *   one case the user cannot see from the map itself,
 * - `set` — a resolved target, with the map's display name and the tile.
 *
 * Splitting `broken` out of `unset` is the same distinction 5.6 made for
 * the atlas lines: "not authored" and "points at something gone" need
 * different words, and merging them hides a real data error.
 */
export type DoorTargetState =
  | { kind: 'unset' }
  | { kind: 'broken'; targetMapId: string }
  | { kind: 'set'; targetMapId: string; mapName: string; tile: Tile }

/**
 * Resolve a door's teleport against the project's map list.
 *
 * A target tile is part of what makes a target resolved: a teleport that
 * names a map but no tile cannot put the hero anywhere, so it reads as
 * `unset` rather than pretending to a destination. That matches
 * `collectAtlasTeleports`, which nulls the same case for the atlas.
 */
export function doorTargetState(teleport: DoorTeleport | null, mapNames: ReadonlyMap<string, string>): DoorTargetState {
  const targetMapId = teleport?.targetMapId
  if (!targetMapId) return { kind: 'unset' }
  const mapName = mapNames.get(targetMapId)
  if (mapName === undefined) return { kind: 'broken', targetMapId }
  const { targetTileX, targetTileY } = teleport ?? {}
  if (typeof targetTileX !== 'number' || typeof targetTileY !== 'number') return { kind: 'unset' }
  return { kind: 'set', targetMapId, mapName, tile: { x: targetTileX, y: targetTileY } }
}

/**
 * The door's teleport data after the user picked `targetMapId` and
 * `tile`.
 *
 * Everything else the teleport carried is kept — `facing` and `label`
 * are the user's earlier answers to questions the picker never asks, and
 * dropping them would silently undo hand-authored data every time
 * someone re-pointed a door.
 */
export function withDoorTarget(
  teleport: DoorTeleport | null,
  targetMapId: string,
  tile: Tile,
): DoorTeleport & { type: 'teleport' } {
  return {
    ...(teleport ?? {}),
    type: 'teleport',
    targetMapId,
    targetTileX: tile.x,
    targetTileY: tile.y,
  }
}

/**
 * The door's teleport data with its destination removed — what the
 * atlas's *Remove* writes.
 *
 * `facing` and `label` survive, for the same reason {@link withDoorTarget}
 * keeps them: they are hand-authored answers to questions the removal
 * never asked. The door stays a door, now one that goes nowhere — which
 * the atlas already has a shape for (a red stub) and the inspector reads
 * as `unset`. Deleting the placement instead would throw away the
 * sprite, the collider and the position someone placed by hand.
 */
export function withoutDoorTarget(teleport: DoorTeleport | null): DoorTeleport & { type: 'teleport' } {
  const { facing, label } = teleport ?? {}
  const cleared: DoorTeleport & { type: 'teleport' } = { type: 'teleport' }
  if (facing !== undefined) cleared.facing = facing
  if (label !== undefined) cleared.label = label
  return cleared
}

/**
 * `components` with its teleport entry replaced by `teleport` — or
 * `teleport` appended when it carried none.
 *
 * Every other component is kept and keeps its position: a door is also a
 * sprite, a collider and usually a trigger, and the door back is a copy
 * of a real door with only its destination rewritten. Rebuilding the
 * list from the teleport alone would strip the thing down to a teleport
 * that looks like nothing on the map.
 */
export function withDoorTargetComponents(
  components: readonly ComponentEntry[] | undefined,
  teleport: DoorTeleport & { type: 'teleport' },
): ComponentEntry[] {
  const existing = components ?? []
  // Spread into a fresh literal: `DoorTeleport` is an interface, and an
  // interface has no implicit index signature, so it is not a
  // `ComponentEntry` until it is copied into one.
  const entry: ComponentEntry = { ...teleport }
  if (!existing.some((component) => component.type === 'teleport')) return [...existing, entry]
  return existing.map((component) => (component.type === 'teleport' ? entry : component))
}

/** The way back out of a door you just walked through. */
export function oppositeFacing(facing: DoorFacing): DoorFacing {
  switch (facing) {
    case 'up':
      return 'down'
    case 'down':
      return 'up'
    case 'left':
      return 'right'
    default:
      return 'left'
  }
}

const FACING_STEPS: Record<DoorFacing, Tile> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/**
 * `tile` stepped one square along `facing`, kept on the map: the mirror
 * step if the first would leave it, and `tile` itself if the map is only
 * one square across in that axis.
 */
function stepOnMap(tile: Tile, facing: DoorFacing, bounds: MapBounds): Tile {
  const step = FACING_STEPS[facing]
  const inside = (candidate: Tile): boolean =>
    candidate.x >= 0 && candidate.y >= 0 && candidate.x < bounds.columns && candidate.y < bounds.rows
  const forward = { x: tile.x + step.x, y: tile.y + step.y }
  if (inside(forward)) return forward
  const back = { x: tile.x - step.x, y: tile.y - step.y }
  if (inside(back)) return back
  return tile
}

/** Where the "Add a door back" switch puts the return door, and what it points at. */
export interface DoorBackPlan {
  /** The tile on the TARGET map the return door is placed on. */
  placeAt: Tile
  /** The tile on the SOURCE map the return door sends the hero to. */
  targetTile: Tile
  /** The facing the return door's own teleport arrives with. */
  facing: DoorFacing
}

/**
 * Plan the return door for a door on `sourceTile` that now arrives at
 * `arrivalTile`.
 *
 * § 6.2 says the switch "places the return door on the target tile", and
 * taken literally that is a trap: the hero would materialise standing on
 * a walk-onto trigger pointing back where they came from, and the two
 * doors would bounce them forever. So the return door sits one tile
 * *behind* the arriving hero — opposite the door's arrival facing —
 * and it sends them one tile behind the original door for the same
 * reason. Both doors stay within one tile of each other's arrival tile,
 * so `map-connections.model.ts` still merges them into one solid line
 * (`PAIR_TILE_SLACK`).
 *
 * That is not invention: it is exactly how the sample project's own
 * doors are authored — Kokiri Forest's door at (76, 67) arrives facing
 * `up` at (10, 12) in the tree house, and the return door sits at
 * (10, 13) pointing back at (76, 68).
 *
 * `facing` defaults to `down` when the door names none, which puts the
 * return door above the arrival tile; with no facing authored there is
 * no better answer, and any of the four is safe because the only thing
 * that matters is *not* the arrival tile itself.
 */
export function planDoorBack(args: {
  sourceTile: Tile
  sourceBounds: MapBounds
  arrivalTile: Tile
  arrivalBounds: MapBounds
  facing?: DoorFacing
}): DoorBackPlan {
  const out = oppositeFacing(args.facing ?? 'down')
  return {
    placeAt: stepOnMap(args.arrivalTile, out, args.arrivalBounds),
    targetTile: stepOnMap(args.sourceTile, out, args.sourceBounds),
    facing: out,
  }
}
