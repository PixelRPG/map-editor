/**
 * The Checkup group's model — "what stops this game from working",
 * REDESIGN.md § 4.5 step 2: the validator's output with a face.
 *
 * Pure, GTK-free and string-free on purpose. Two reasons:
 *
 * 1. The rows are derived from four independent sources (the hero, the
 *    start map, every door's target, every map's inbound doors) and the
 *    interesting cases are all absences — exactly the shape a fixture
 *    test can state and a running editor cannot.
 * 2. Every row carries a map or door NAME, so the sentence needs
 *    interpolation. The model emits a FACT and the widget formats it
 *    with `_()`, the same split `dormantComponentFacts` uses — a model
 *    that returned finished sentences would either hard-code English or
 *    pull gettext into a unit test.
 *
 * The checkup is derived read-only state: it syncs itself, because
 * everything it reads is already synced (§ 8 — no `Command`, no
 * `__project/*` op of its own).
 */

/** How a row reads: a blocker, a smell worth saying, or the all-clear. */
export type CheckupSeverity = 'problem' | 'hint' | 'ready'

/**
 * One thing the checkup found. Discriminated so the widget's `switch`
 * is exhaustive and a new fact cannot be added without wording it.
 */
export type CheckupFact =
  /** Nothing is wrong — the single row a clean project shows. */
  | { readonly kind: 'ready' }
  /** No `playerActorId`. `characterCount` decides between "pick one" and "make one". */
  | { readonly kind: 'no-hero'; readonly characterCount: number }
  /** No `startup.initialMapId`. `mapCount` 0 means there is no map to pick either. */
  | { readonly kind: 'no-start-map'; readonly mapCount: number }
  /** A door whose target map is missing or unknown — `collectAtlasTeleports`' `to: null`. */
  | {
      readonly kind: 'door-goes-nowhere'
      readonly mapId: string
      readonly mapName: string
      readonly placementId: string
      /** The door's own label, or `''` when it carries none. */
      readonly doorLabel: string
    }
  /** More dangling doors than the group lists one by one. */
  | { readonly kind: 'more-doors'; readonly count: number }
  /** A map no door leads into — reachable only by being the start map. */
  | { readonly kind: 'map-unreachable'; readonly mapId: string; readonly mapName: string }
  /** More unreachable maps than the group lists one by one. */
  | { readonly kind: 'more-unreachable'; readonly count: number }

/**
 * The `win.*` action a row activates. A string for an `s` action, a pair
 * for `focus-placement`'s `(ss)`, `null` for a parameterless one — and
 * the whole link is `null` for a row the Game page answers itself.
 */
export interface CheckupLink {
  readonly action: string
  readonly target: string | readonly [string, string] | null
}

/** One row of the Checkup group. */
export interface CheckupRow {
  /**
   * Stable within one build of the model — the widget keys nothing on
   * it, but a test naming the row it means reads better than an index.
   */
  readonly id: string
  readonly fact: CheckupFact
  readonly severity: CheckupSeverity
  readonly link: CheckupLink | null
}

/** One map, as much of it as the checkup reads. */
export interface CheckupMap {
  readonly id: string
  readonly name?: string
}

/**
 * One door, in the shape `collectAtlasTeleports` emits: `to: null` is
 * the "goes nowhere" signal (a door with no `targetMapId`, or one
 * naming a map this project does not have).
 */
export interface CheckupDoor {
  readonly from: string
  readonly to: string | null
  readonly placementId: string
  readonly label?: string
}

/** What {@link buildGameCheckup} reads — narrow, so a test passes literals. */
export interface GameCheckupInput {
  /** `GameProjectData.playerActorId`. */
  readonly playerActorId?: string | null
  /** `GameProjectData.startup.initialMapId`. */
  readonly startMapId?: string | null
  /** Every LOADED map, in project order. */
  readonly maps?: Iterable<CheckupMap>
  /** Every door in those maps. */
  readonly doors?: Iterable<CheckupDoor>
  /**
   * The ids of the project's characters. Given, a `playerActorId` that
   * resolves to none of them reads as "no hero" — which is what it is.
   */
  readonly characterIds?: Iterable<string>
}

/**
 * How many rows of one repeating kind the group lists before collapsing
 * the rest into a single "and N more" row pointing at the World view,
 * where every dangling door is already drawn (§ 6.2). A project that
 * broke forty doors at once needs one sentence, not forty rows.
 */
export const CHECKUP_MAX_ROWS_PER_KIND = 5

/**
 * Build the Checkup rows for a project: problems first, then hints, and
 * a single `ready` row when there is neither.
 *
 * Order within the problems is fixed — hero, start map, doors — so the
 * group does not reshuffle while someone works through it.
 */
export function buildGameCheckup(input: GameCheckupInput = {}): CheckupRow[] {
  const maps = [...(input.maps ?? [])]
  const doors = [...(input.doors ?? [])]
  const names = new Map(maps.map((map) => [map.id, map.name?.trim() || map.id]))

  const problems: CheckupRow[] = []
  const hints: CheckupRow[] = []

  const hero = resolveHero(input)
  if (!hero.set) {
    problems.push({
      id: 'no-hero',
      fact: { kind: 'no-hero', characterCount: hero.characterCount },
      severity: 'problem',
      // Both wordings end in the same place: the Characters gallery is
      // where a hero is either picked or made.
      link: { action: 'win.library-chip', target: 'characters' },
    })
  }

  if (!input.startMapId || !names.has(input.startMapId)) {
    problems.push({
      id: 'no-start-map',
      fact: { kind: 'no-start-map', mapCount: maps.length },
      severity: 'problem',
      // With no map at all the fix is to make one; otherwise the Start
      // group right below answers it, so the row has no action of its
      // own and the page opens its own picker.
      link: maps.length === 0 ? { action: 'win.new-map', target: null } : null,
    })
  }

  const dangling = doors.filter((door) => door.to === null)
  for (const door of dangling.slice(0, CHECKUP_MAX_ROWS_PER_KIND)) {
    problems.push({
      id: `door-goes-nowhere:${door.from}:${door.placementId}`,
      fact: {
        kind: 'door-goes-nowhere',
        mapId: door.from,
        mapName: names.get(door.from) ?? door.from,
        placementId: door.placementId,
        doorLabel: door.label?.trim() ?? '',
      },
      severity: 'problem',
      link: { action: 'win.focus-placement', target: [door.from, door.placementId] },
    })
  }
  if (dangling.length > CHECKUP_MAX_ROWS_PER_KIND) {
    problems.push({
      id: 'more-doors',
      fact: { kind: 'more-doors', count: dangling.length - CHECKUP_MAX_ROWS_PER_KIND },
      severity: 'problem',
      link: { action: 'win.back-to-atlas', target: null },
    })
  }

  const unreachable = unreachableMaps(maps, doors, input.startMapId ?? null)
  for (const map of unreachable.slice(0, CHECKUP_MAX_ROWS_PER_KIND)) {
    hints.push({
      id: `map-unreachable:${map.id}`,
      fact: { kind: 'map-unreachable', mapId: map.id, mapName: names.get(map.id) ?? map.id },
      severity: 'hint',
      // Not the map itself: "nothing leads here" is a fact about the
      // other maps, and the World view is where that graph is visible.
      link: { action: 'win.back-to-atlas', target: null },
    })
  }
  if (unreachable.length > CHECKUP_MAX_ROWS_PER_KIND) {
    hints.push({
      id: 'more-unreachable',
      fact: { kind: 'more-unreachable', count: unreachable.length - CHECKUP_MAX_ROWS_PER_KIND },
      severity: 'hint',
      link: { action: 'win.back-to-atlas', target: null },
    })
  }

  if (problems.length === 0 && hints.length === 0) {
    return [{ id: 'ready', fact: { kind: 'ready' }, severity: 'ready', link: null }]
  }
  return [...problems, ...hints]
}

/** Whether a hero is set at all, and how many characters there are to choose from. */
function resolveHero(input: GameCheckupInput): { set: boolean; characterCount: number } {
  const ids = input.characterIds ? [...input.characterIds] : null
  const playerActorId = input.playerActorId ?? null
  // Without a character list the id is taken at its word: the store
  // clears `playerActorId` when the hero is deleted, so a dangling one
  // only happens to hand-edited project files.
  const set = playerActorId !== null && playerActorId !== '' && (ids === null || ids.includes(playerActorId))
  return { set, characterCount: ids?.length ?? 0 }
}

/**
 * Maps no door leads into, in project order. The start map is excluded —
 * the hero arrives there without walking through anything, which is the
 * whole point of a start map.
 */
function unreachableMaps(
  maps: readonly CheckupMap[],
  doors: readonly CheckupDoor[],
  startMapId: string | null,
): CheckupMap[] {
  // A door from a map to ITSELF (a staircase between two floors) does
  // not count: it is no way in from anywhere else. The check is the
  // spec's literal wording — "no door leads to X" — not transitive
  // reachability from the start map, which would report a whole
  // connected region for one missing door and name the wrong map.
  const reached = new Set(doors.flatMap((door) => (door.to === null || door.to === door.from ? [] : [door.to])))
  return maps.filter((map) => map.id !== startMapId && !reached.has(map.id))
}
