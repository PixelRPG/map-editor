import { parsePixelrpgUrl } from './pixelrpg-url.ts'
import type { RecentProjectEntry } from './recent-projects.ts'

/**
 * What the welcome column renders from the persisted recents list:
 * the Continue card, the rows below it, and how many bookmarks point
 * at files that are gone (the "Tidy up" count).
 *
 * `continueProject` is the entry the Continue card previews; it is
 * deliberately NOT repeated in `rows`, because the design stacks the
 * two sections directly on top of each other (REDESIGN § 4.1) and the
 * same project twice in a row reads as a bug.
 */
export interface WelcomeRecents {
  readonly continueProject: RecentProjectEntry | null
  readonly rows: readonly RecentProjectEntry[]
  readonly missingCount: number
}

/** The join field accepts the same token shape `pixelrpg://join/<id>` carries. */
const JOIN_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Split the recents list into the welcome view's two sections.
 *
 * Expects newest-first order — `recordRecentProject` prepends, so the
 * first entry that still exists on disk is "the project you were last
 * working on" and becomes the Continue card.
 *
 * Missing entries never get a row (a bookmark to an unmounted drive
 * cannot be opened); they are only counted, for the Tidy-up row.
 */
export function buildWelcomeRecents(recents: readonly RecentProjectEntry[], maxRows: number): WelcomeRecents {
  const present = captionDuplicateNames(recents.filter((recent) => !recent.missing))
  const [continueProject, ...rest] = present
  return {
    continueProject: continueProject ?? null,
    rows: rest.slice(0, Math.max(0, maxRows)),
    missingCount: recents.length - present.length,
  }
}

/**
 * Two projects called the same thing are told apart by their folder:
 * the caption of every entry whose `name` repeats is replaced with the
 * directory holding its `game-project.json` (REDESIGN § 4.1 — "Two
 * recents with the same name show their folder as the caption instead
 * of the description"). Unique names keep the project's description.
 */
export function captionDuplicateNames(recents: readonly RecentProjectEntry[]): RecentProjectEntry[] {
  const counts = new Map<string, number>()
  for (const recent of recents) counts.set(recent.name, (counts.get(recent.name) ?? 0) + 1)
  return recents.map((recent) =>
    (counts.get(recent.name) ?? 0) > 1 ? { ...recent, caption: folderLabel(recent.path) } : { ...recent },
  )
}

/**
 * Name of the directory containing a `game-project.json`, which is
 * what a user recognises a checkout by. Falls back to the whole path
 * when there is no parent segment to show.
 */
export function folderLabel(projectFilePath: string): string {
  const segments = projectFilePath.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[segments.length - 2] : projectFilePath
}

/**
 * Normalise what the user pasted into the join dialog to a room id, or
 * `null` when it cannot be one. Accepts a full
 * `pixelrpg://join/<roomid>` URL as well as a bare code, and tolerates
 * the punctuation a chat client wraps a pasted code in.
 */
export function normaliseJoinCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const intent = parsePixelrpgUrl(trimmed)
  const roomId = intent?.kind === 'join' ? intent.roomId : trimmed.replace(/^\W+|\W+$/g, '')
  return JOIN_CODE_PATTERN.test(roomId) ? roomId : null
}
