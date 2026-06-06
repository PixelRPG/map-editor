import { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '@pixelrpg/gjs'

const SOLID_PALETTE = ['#3d6b3a', '#3a5e7b', '#7a5a3a', '#6b3a3a', '#4a4a6b', '#6b6b3a', '#3a6b6b']

/** Result returned by {@link loadProjectAsAtlas}. */
export interface LoadedProject {
  /** Project source path on disk (handy for engine.loadProject). */
  projectPath: string
  /** Display name of the project (from `game-project.json#/name`). */
  projectName: string
  /** Atlas scene cards derived from the project's map list. */
  scenes: SampleScene[]
  /** Teleports between scenes, sourced from the project's `teleports[]` array. */
  teleports: SampleTeleport[]
  /** Underlying engine resource — reuse for sprite-set / map lookups. */
  resource: GameProjectResource
}

/**
 * Auto-layout helper: place each map on a 3×N grid in atlas space.
 * Used when a map has no `editorData.atlasX/atlasY` persisted yet.
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
 * atlas {@link SampleScene}, plus the project-level `teleports[]`
 * into {@link SampleTeleport}s for the atlas overlay.
 *
 * Atlas positions come from `mapData.editorData.atlasX/atlasY` when
 * the project has them; otherwise the loader falls back to a 3-column
 * auto-layout (`laidOutPosition`).
 *
 * Tile previews on the atlas cards reuse the loaded
 * `GameProjectResource` — no separate filesystem pass.
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
    // Respect persisted atlas coordinates when available — falls back
    // to a stable auto-layout otherwise. `editorData` is loose-typed,
    // so guard the lookup.
    const editor = (data.editorData ?? {}) as { atlasX?: unknown; atlasY?: unknown }
    const fallback = laidOutPosition(index)
    const x = typeof editor.atlasX === 'number' ? editor.atlasX : fallback.x
    const y = typeof editor.atlasY === 'number' ? editor.atlasY : fallback.y
    scenes.push({
      id: data.id,
      name: data.name ?? data.id,
      rows: [],
      cols,
      previewRows: rows,
      previewColor: placeholderColor(data.id),
      x,
      y,
      tilePx,
      // Event count is the number of object placements on the map —
      // every kind counts (NPCs, items, teleports, …). Pre-migration
      // code counted the legacy `type: 'object'` layers; that field
      // is gone and placements are the new source of truth.
      events: data.objectPlacements?.length ?? 0,
    })
  })

  // Aggregate teleports for the atlas overlay by walking every map's
  // `objectPlacements` and picking out `kind: 'teleport'` entries.
  // This replaces the legacy project-level `teleports[]` array that
  // PR 2 of the object-system rollout removed.
  const teleports: SampleTeleport[] = maps.flatMap((mapResource) => {
    const data = mapResource.mapData
    const placements = data?.objectPlacements ?? []
    return placements.flatMap((placement) => {
      const def = placement.inline // PR 2 always inlined teleports; library refs are an editor concern
      if (def?.kind !== 'teleport') return []
      const props = def.properties as
        | { targetMapId?: string; targetTileX?: number; targetTileY?: number; label?: string }
        | undefined
      if (!props?.targetMapId || typeof props.targetTileX !== 'number' || typeof props.targetTileY !== 'number')
        return []
      return [
        {
          from: data.id,
          fx: placement.tileX,
          fy: placement.tileY,
          to: props.targetMapId,
          tx: props.targetTileX,
          ty: props.targetTileY,
          label: props.label ?? def.name ?? '',
        },
      ]
    })
  })

  return { projectPath, projectName, scenes, teleports, resource }
}
