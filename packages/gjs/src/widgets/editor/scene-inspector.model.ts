// Pure projections behind the atlas scene inspector: the caption, the
// 2×2 stat grid and the per-direction teleport list. GTK-free so it can
// be unit-tested (the inspector subclasses `Adw.Bin`).

/** The scene fields the inspector projects — `SampleScene` satisfies it. */
export interface InspectedScene {
  id: string
  rows: string[]
  cols?: number
  previewRows?: number
  music?: string
  events: number
  npcs?: unknown[]
}

/** A teleport link between two scenes. */
export interface SceneLink {
  from: string
  to: string
  label: string
}

/** One row of the inspector's teleport list, already resolved for display. */
export interface TeleportSummary {
  label: string
  /** Other-scene id (destination when outgoing, source when incoming). */
  otherSceneId: string
  /** Pre-formatted display name of the other scene. */
  otherSceneName: string
  direction: 'in' | 'out'
}

/** One cell of the inspector's stat grid. */
export interface SceneStat {
  label: string
  value: string
}

/** Map size in tiles — terrain rows if present, else the card geometry. */
export function sceneTileSize(scene: InspectedScene): { cols: number; rows: number } {
  return {
    cols: scene.rows[0]?.length || scene.cols || 0,
    rows: scene.rows.length || scene.previewRows || 0,
  }
}

/** The "12×10 tiles · overworld" caption under the scene name. */
export function sceneSubtitleText(scene: InspectedScene): string {
  const { cols, rows } = sceneTileSize(scene)
  return `${cols}×${rows} tiles · ${scene.music ?? 'no music'}`
}

/** The four stat cards: NPCs / Events / incoming / outgoing teleports. */
export function sceneStats(scene: InspectedScene, teleports: readonly SceneLink[]): SceneStat[] {
  return [
    { label: 'NPCs', value: String(scene.npcs?.length ?? 0) },
    { label: 'Events', value: String(scene.events) },
    { label: 'In', value: String(teleports.filter((t) => t.to === scene.id).length) },
    { label: 'Out', value: String(teleports.filter((t) => t.from === scene.id).length) },
  ]
}

/**
 * Every teleport touching `scene`, resolved to the OTHER end's display
 * name. A self-teleport counts once, as outgoing.
 */
export function teleportSummaries(
  scene: InspectedScene,
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

/**
 * Tile size (px) that fits a `cols × rows` map into the inspector's
 * preview box. Floored to whole pixels so the mini-map stays crisp, with
 * a floor of 1 so a huge map still renders something.
 */
export function previewTilePx(cols: number, rows: number, boxWidth: number, boxHeight: number): number {
  return Math.max(1, Math.floor(Math.min(boxWidth / cols, boxHeight / rows)))
}
