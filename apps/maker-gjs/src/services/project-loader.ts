import { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '@pixelrpg/gjs'

const SOLID_PALETTE = [
  '#3d6b3a',
  '#3a5e7b',
  '#7a5a3a',
  '#6b3a3a',
  '#4a4a6b',
  '#6b6b3a',
  '#3a6b6b',
]

/** Result returned by {@link loadProjectAsAtlas}. */
export interface LoadedProject {
  /** Project source path on disk (handy for engine.loadProject). */
  projectPath: string
  /** Display name of the project (from `game-project.json#/name`). */
  projectName: string
  /** Atlas scene cards derived from the project's map list. */
  scenes: SampleScene[]
  /** Teleports between scenes (empty until project format gains them). */
  teleports: SampleTeleport[]
  /** Underlying engine resource — reuse for sprite-set / map lookups. */
  resource: GameProjectResource
}

/**
 * Auto-layout helper: place each map on a 3×N grid in atlas space using
 * a per-map gap derived from the largest preview dimensions. Until we
 * have persisted atlas coordinates in `editorData`, this gives a
 * reasonable default.
 */
function laidOutPosition(index: number): { x: number; y: number } {
  const col = index % 3
  const row = Math.floor(index / 3)
  return { x: 20 + col * 360, y: 20 + row * 240 }
}

/**
 * Pick a deterministic placeholder colour for a map so atlas cards are
 * visually distinct without rendering the actual tile contents.
 */
function placeholderColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return SOLID_PALETTE[hash % SOLID_PALETTE.length]
}

/**
 * Load a `game-project.json` and convert every referenced map into an
 * atlas {@link SampleScene}. Teleports are empty until the project
 * format gains explicit teleport metadata.
 *
 * Card previews are intentionally solid colours: the real tile-rendered
 * thumbnails require sprite-set decoding which is heavy enough that it
 * should live behind a tileset preview cache (future).
 *
 * The returned {@link LoadedProject.resource} is the loaded
 * `GameProjectResource`; downstream code can pull sprite sets, layers,
 * and map metadata from it without re-parsing files.
 */
export async function loadProjectAsAtlas(projectPath: string): Promise<LoadedProject> {
  const resource = new GameProjectResource(projectPath, {
    preloadAllMaps: true,
    preloadAllSpriteSets: true,
  })
  await resource.load()

  const projectName = resource.data?.name ?? 'Untitled Project'
  const scenes: SampleScene[] = []

  const maps = Array.from(resource.maps.values())
  maps.forEach((mapResource, index) => {
    const data = mapResource.mapData
    if (!data) return
    const cols = data.columns
    const rows = data.rows
    const tilePx = Math.max(2, Math.min(8, Math.floor(180 / Math.max(cols, 1))))
    const pos = laidOutPosition(index)
    scenes.push({
      id: data.id,
      name: data.name ?? data.id,
      rows: [],
      cols,
      previewRows: rows,
      previewColor: placeholderColor(data.id),
      x: pos.x,
      y: pos.y,
      tilePx,
      events: data.layers?.filter((l) => l.type === 'object').length ?? 0,
    })
  })

  return { projectPath, projectName, scenes, teleports: [], resource }
}
