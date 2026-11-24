import type { FlagData, FlagKind, FlagUsage, FlagValue } from '@pixelrpg/engine'

/**
 * What the Game memory panel shows during a test run, as plain data.
 *
 * The panel lists the project's flags twice over: the ones that hold one
 * value for the whole game, then — per placement — the ones each thing
 * remembers for itself (`scope: 'thing'`). A thing shows under its NAME;
 * its placement id is the save key and never reaches the screen.
 */

/** The range a number flag's spinner covers, the same the action editor offers. */
export const FLAG_NUMBER_RANGE = { min: -100000, max: 100000, step: 1 }

/** One editable line: a flag, and whose value it is. */
export interface MemoryRow {
  /** `flag` for a game-scoped value, `placementId/flag` for a thing's. Stable across value changes. */
  key: string
  flag: string
  name: string
  kind: FlagKind
  /** The owning placement for a thing-scoped value, `null` for the whole game. */
  thing: string | null
  value: FlagValue
}

/** One placement and its own values. */
export interface MemoryThing {
  placementId: string
  name: string
  /** Where it stands, so two chests of one kind can be told apart. */
  tileX: number
  tileY: number
  rows: MemoryRow[]
}

export interface MemorySections {
  game: MemoryRow[]
  things: MemoryThing[]
}

/** A placement the panel may list; the host resolves its name. */
export interface MemoryPlacement {
  id: string
  /** The library entry it instantiates; usages that sit on the entry itself count for every placement of it. */
  defId?: string
  name: string
  tileX: number
  tileY: number
}

/** The record's two value bags, as `RuntimeSnapshot` carries them. */
export interface MemoryValues {
  flags: Readonly<Record<string, FlagValue>>
  thingFlags: Readonly<Record<string, Readonly<Record<string, FlagValue>>>>
}

/** The flags a placement's own data names (its states, its actions), thing-scoped only. */
function thingFlagsOf(
  placement: MemoryPlacement,
  defs: readonly FlagData[],
  usages: ReadonlyMap<string, readonly FlagUsage[]>,
): FlagData[] {
  return defs.filter(
    (def) =>
      def.scope === 'thing' &&
      (usages.get(def.id) ?? []).some(
        (u) => u.placementId === placement.id || (u.placementId === null && u.entityId === placement.defId),
      ),
  )
}

/**
 * The panel's rows for the current values.
 *
 * A value nobody has written yet reads as the flag's `initial`, which is
 * what the game itself would read. A placement shows only when its data
 * names a thing-scoped flag, so a map of fifty decorations does not
 * become fifty empty groups; placements are listed in reading order
 * (top to bottom, left to right) rather than in the order they were made.
 */
export function memorySections(
  defs: readonly FlagData[],
  placements: readonly MemoryPlacement[],
  usages: ReadonlyMap<string, readonly FlagUsage[]>,
  values: MemoryValues,
): MemorySections {
  const row = (def: FlagData, thing: string | null, value: FlagValue | undefined): MemoryRow => ({
    key: thing === null ? def.id : `${thing}/${def.id}`,
    flag: def.id,
    name: def.name,
    kind: def.kind,
    thing,
    value: value ?? def.initial,
  })
  const game = defs.filter((d) => d.scope !== 'thing').map((d) => row(d, null, values.flags[d.id]))
  const things: MemoryThing[] = []
  for (const p of [...placements].sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX)) {
    const own = thingFlagsOf(p, defs, usages)
    if (own.length === 0) continue
    things.push({
      placementId: p.id,
      name: p.name,
      tileX: p.tileX,
      tileY: p.tileY,
      rows: own.map((d) => row(d, p.id, values.thingFlags[p.id]?.[d.id])),
    })
  }
  return { game, things }
}

/**
 * What decides whether the panel's rows have to be rebuilt: the set of
 * rows and the names they carry, never their values. A value change must
 * update a row in place — rebuilding it would take the focus from the
 * spinner the person is dragging.
 */
export function memoryShape(sections: MemorySections): string {
  const line = (r: MemoryRow) => `${r.key}:${r.kind}:${r.name}`
  return JSON.stringify([
    sections.game.map(line),
    sections.things.map((t) => [t.placementId, t.name, t.tileX, t.tileY, t.rows.map(line)]),
  ])
}
