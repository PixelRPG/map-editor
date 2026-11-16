import { describe, expect, it } from '@gjsify/unit'
import {
  buildGameCheckup,
  CHECKUP_MAX_ROWS_PER_KIND,
  type CheckupDoor,
  type CheckupFact,
  type CheckupRow,
} from './game-checkup.model.ts'

/** A door that leads somewhere, or nowhere when `to` is null. */
const door = (from: string, to: string | null, placementId = `p-${from}-${to}`, label?: string): CheckupDoor => ({
  from,
  to,
  placementId,
  label,
})

/** A project the checkup finds nothing wrong with — the baseline every case bends. */
const healthy = {
  playerActorId: 'link',
  startMapId: 'forest',
  maps: [
    { id: 'forest', name: 'Kokiri Forest' },
    { id: 'house', name: "Link's Tree House" },
  ],
  doors: [door('forest', 'house'), door('house', 'forest')],
  characterIds: ['link'],
}

const kinds = (rows: readonly CheckupRow[]): CheckupFact['kind'][] => rows.map((row) => row.fact.kind)

/** The first row of `kind`, as a fact narrowed to it. */
function factOf<K extends CheckupFact['kind']>(
  rows: readonly CheckupRow[],
  kind: K,
): Extract<CheckupFact, { kind: K }> {
  const row = rows.find((r) => r.fact.kind === kind)
  if (!row) throw new Error(`no ${kind} row in [${kinds(rows).join(', ')}]`)
  return row.fact as Extract<CheckupFact, { kind: K }>
}

export default async () => {
  await describe('buildGameCheckup', async () => {
    await it('reports a clean project as one ready row', async () => {
      const rows = buildGameCheckup(healthy)
      expect(rows.length).toBe(1)
      expect(rows[0].id).toBe('ready')
      expect(rows[0].severity).toBe('ready')
      expect(rows[0].link).toBe(null)
    })

    await it('reports an empty project rather than throwing', async () => {
      const rows = buildGameCheckup()
      expect(kinds(rows)).toStrictEqual(['no-hero', 'no-start-map'])
      // No map to pick: the row offers to make one instead of pointing
      // at a picker that would open empty.
      expect(rows[1].link).toStrictEqual({ action: 'win.new-map', target: null })
      expect(factOf(rows, 'no-start-map').mapCount).toBe(0)
      expect(factOf(rows, 'no-hero').characterCount).toBe(0)
    })

    await it('sends the missing hero to the Characters gallery', async () => {
      const rows = buildGameCheckup({ ...healthy, playerActorId: null })
      expect(kinds(rows)).toStrictEqual(['no-hero'])
      expect(rows[0].severity).toBe('problem')
      expect(rows[0].link).toStrictEqual({ action: 'win.library-chip', target: 'characters' })
      // One character exists, so the row means "pick", not "make".
      expect(factOf(rows, 'no-hero').characterCount).toBe(1)
    })

    await it('treats a player id no character answers to as no hero', async () => {
      // Only reachable from a hand-edited project file — `removeEntity`
      // clears `playerActorId` with the hero — but it is exactly the
      // state where the game starts with nobody in it.
      const rows = buildGameCheckup({ ...healthy, playerActorId: 'ganon' })
      expect(kinds(rows)).toStrictEqual(['no-hero'])
    })

    await it('takes the player id at its word with no character list', async () => {
      const rows = buildGameCheckup({ ...healthy, characterIds: undefined, playerActorId: 'whoever' })
      expect(kinds(rows)).toStrictEqual(['ready'])
    })

    await it('treats an empty player id as unset', async () => {
      expect(kinds(buildGameCheckup({ ...healthy, playerActorId: '' }))).toStrictEqual(['no-hero'])
    })

    await it('reports a start map the project does not have', async () => {
      const rows = buildGameCheckup({ ...healthy, startMapId: 'dungeon' })
      // "forest" is now reachable through the house door, "house"
      // through the forest door — only the start map is missing.
      expect(kinds(rows)).toStrictEqual(['no-start-map'])
      expect(factOf(rows, 'no-start-map').mapCount).toBe(2)
      // Two maps to choose from, so the Start group right below answers
      // it and the row carries no action of its own.
      expect(rows[0].link).toBe(null)
    })

    await it('names the map a dangling door sits in, and links to the door', async () => {
      const rows = buildGameCheckup({
        ...healthy,
        doors: [door('forest', 'house'), door('house', 'forest'), door('forest', null, 'gate', ' Shed  ')],
      })
      expect(kinds(rows)).toStrictEqual(['door-goes-nowhere'])
      const fact = factOf(rows, 'door-goes-nowhere')
      expect(fact.mapName).toBe('Kokiri Forest')
      expect(fact.placementId).toBe('gate')
      expect(fact.doorLabel).toBe('Shed')
      expect(rows[0].id).toBe('door-goes-nowhere:forest:gate')
      expect(rows[0].link).toStrictEqual({ action: 'win.focus-placement', target: ['forest', 'gate'] })
    })

    await it('falls back to the map id when a map carries no name', async () => {
      const rows = buildGameCheckup({
        ...healthy,
        maps: [{ id: 'forest' }, { id: 'house', name: '  ' }],
        doors: [door('house', null, 'gate')],
      })
      expect(factOf(rows, 'door-goes-nowhere').mapName).toBe('house')
      expect(factOf(rows, 'map-unreachable').mapName).toBe('house')
    })

    await it('collapses more dangling doors than it lists', async () => {
      const many = Array.from({ length: CHECKUP_MAX_ROWS_PER_KIND + 3 }, (_, i) => door('forest', null, `gate-${i}`))
      const rows = buildGameCheckup({ ...healthy, doors: [...healthy.doors, ...many] })
      expect(rows.filter((row) => row.fact.kind === 'door-goes-nowhere').length).toBe(CHECKUP_MAX_ROWS_PER_KIND)
      expect(factOf(rows, 'more-doors').count).toBe(3)
      expect(rows[rows.length - 1].link).toStrictEqual({ action: 'win.back-to-atlas', target: null })
    })

    await it('hints at a map no door leads to', async () => {
      const rows = buildGameCheckup({ ...healthy, doors: [door('house', 'forest')] })
      expect(kinds(rows)).toStrictEqual(['map-unreachable'])
      const row = rows[0]
      expect(row.severity).toBe('hint')
      expect(factOf(rows, 'map-unreachable').mapName).toBe("Link's Tree House")
      expect(row.link).toStrictEqual({ action: 'win.back-to-atlas', target: null })
    })

    await it('never hints at the start map, which needs no door', async () => {
      // No door leads into "forest" either, but the hero starts there.
      const rows = buildGameCheckup({ ...healthy, doors: [door('forest', 'house')] })
      expect(kinds(rows)).toStrictEqual(['ready'])
    })

    await it('does not let a door to its own map count as a way in', async () => {
      const rows = buildGameCheckup({ ...healthy, doors: [door('house', 'house', 'stairs')] })
      expect(kinds(rows)).toStrictEqual(['map-unreachable'])
      expect(factOf(rows, 'map-unreachable').mapId).toBe('house')
    })

    await it('collapses more unreachable maps than it lists', async () => {
      const maps = [
        { id: 'forest', name: 'Kokiri Forest' },
        ...Array.from({ length: CHECKUP_MAX_ROWS_PER_KIND + 2 }, (_, i) => ({ id: `m${i}`, name: `Map ${i}` })),
      ]
      const rows = buildGameCheckup({ ...healthy, maps, doors: [] })
      expect(rows.filter((row) => row.fact.kind === 'map-unreachable').length).toBe(CHECKUP_MAX_ROWS_PER_KIND)
      expect(factOf(rows, 'more-unreachable').count).toBe(2)
    })

    await it('orders problems before hints, and keeps problem order fixed', async () => {
      const rows = buildGameCheckup({
        maps: [
          { id: 'forest', name: 'Kokiri Forest' },
          { id: 'house', name: "Link's Tree House" },
        ],
        doors: [door('forest', null, 'gate')],
        characterIds: ['link'],
      })
      expect(kinds(rows)).toStrictEqual([
        'no-hero',
        'no-start-map',
        'door-goes-nowhere',
        'map-unreachable',
        'map-unreachable',
      ])
      // With no start map, neither map is excused its missing door.
      expect(rows.filter((row) => row.severity === 'problem').length).toBe(3)
    })

    await it('keeps the dangling-door rows in the order the doors arrive', async () => {
      const rows = buildGameCheckup({
        ...healthy,
        doors: [door('house', null, 'b'), door('forest', null, 'a'), ...healthy.doors],
      })
      expect(rows.map((row) => row.id)).toStrictEqual(['door-goes-nowhere:house:b', 'door-goes-nowhere:forest:a'])
    })
  })
}
