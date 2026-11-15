// Pure projections behind the atlas's map summaries: the selection
// bar's caption facts, the list-mode thumbnail size and the
// per-direction teleport list. GTK-free so it can be unit-tested (the
// widgets that consume it subclass `Adw.Bin`), which also means no
// gettext in here — the caller owns every translated string.

/** The scene fields a summary projects — `SampleScene` satisfies it. */
export interface SummarizedScene {
  id: string
  rows: string[]
  cols?: number
  previewRows?: number
  events: number
  npcs?: unknown[]
}

/** A teleport link between two scenes. */
export interface SceneLink {
  from: string
  to: string
  label: string
}

/** One row of a map's door list, already resolved for display. */
export interface TeleportSummary {
  label: string
  /** Other-scene id (destination when outgoing, source when incoming). */
  otherSceneId: string
  /** Pre-formatted display name of the other scene. */
  otherSceneName: string
  direction: 'in' | 'out'
}

/** Map size in tiles — terrain rows if present, else the card geometry. */
export function sceneTileSize(scene: SummarizedScene): { cols: number; rows: number } {
  return {
    cols: scene.rows[0]?.length || scene.cols || 0,
    rows: scene.rows.length || scene.previewRows || 0,
  }
}

/**
 * Every teleport touching `scene`, resolved to the OTHER end's display
 * name. A self-teleport counts once, as outgoing.
 */
export function teleportSummaries(
  scene: SummarizedScene,
  allScenes: ReadonlyArray<{ id: string; name: string }>,
  teleports: readonly SceneLink[],
): TeleportSummary[] {
  const nameById = new Map(allScenes.map((s) => [s.id, s.name]))
  const summaries: TeleportSummary[] = []
  for (const teleport of teleports) {
    const outgoing = teleport.from === scene.id
    if (!outgoing && teleport.to !== scene.id) continue
    const otherSceneId = outgoing ? teleport.to : teleport.from
    summaries.push({
      label: teleport.label,
      otherSceneId,
      otherSceneName: nameById.get(otherSceneId) ?? otherSceneId,
      direction: outgoing ? 'out' : 'in',
    })
  }
  return summaries
}

/** The counts the selection bar states about the selected map. */
export interface MapSelectionFacts {
  cols: number
  rows: number
  /** Doors touching the map, a self-teleport counted once. */
  doors: number
  /** NPCs plus events — "things" placed on the map. */
  things: number
}

/**
 * Everything the selection bar's caption is built from. Counting goes
 * through {@link teleportSummaries} rather than a second filter so the
 * number can never disagree with the door list the settings dialog
 * shows — including the self-teleport-counts-once rule. The scene names
 * are irrelevant to a count, hence the empty scene list.
 */
export function mapSelectionFacts(scene: SummarizedScene, teleports: readonly SceneLink[]): MapSelectionFacts {
  const { cols, rows } = sceneTileSize(scene)
  return {
    cols,
    rows,
    doors: teleportSummaries(scene, [], teleports).length,
    things: (scene.npcs?.length ?? 0) + scene.events,
  }
}

/**
 * Join caption fragments with the Adwaita middle dot, dropping the
 * empty ones so a map with nothing on it reads "176 × 148" rather than
 * "176 × 148 · ".
 */
export function joinDetails(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(' · ')
}

/**
 * Tile size (px) that fits a `cols × rows` map into a preview box.
 * Floored to whole pixels so the mini-map stays crisp, with
 * a floor of 1 so a huge map still renders something.
 *
 * A non-positive map size returns 1 rather than dividing by zero:
 * `sceneTileSize` yields `0 × 0` for a scene with neither terrain rows
 * nor card geometry, and an `Infinity` tile size propagates into
 * `MiniMap`'s `width_request` as NaN.
 */
export function previewTilePx(cols: number, rows: number, boxWidth: number, boxHeight: number): number {
  if (cols <= 0 || rows <= 0) return 1
  return Math.max(1, Math.floor(Math.min(boxWidth / cols, boxHeight / rows)))
}
