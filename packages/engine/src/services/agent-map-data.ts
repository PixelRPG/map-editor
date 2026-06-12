import { resolvePlacementDefinition } from '../entity/data-access.ts'
import type { EntityDefinition, GameProjectData, MapData, SpriteSetData } from '../types/data/index.ts'

/**
 * Compact, agent-oriented projection of a map — the data an external
 * driver (MCP/D-Bus agent) needs to REASON about a map without
 * reading pixels: where it can walk, what is placed where, and where
 * doors lead. Kilobytes instead of screenshots, and available with no
 * live engine, scene or visible window.
 *
 * Pure data-in/data-out (map JSON + sprite-set descriptors) so it is
 * unit-testable and identical between editor, future game-browser
 * runtime and headless tooling.
 */
export interface AgentMapData {
  id: string
  name: string
  columns: number
  rows: number
  tileWidth: number
  tileHeight: number
  /**
   * One string per row, one char per column:
   * `.` walkable tile, `#` solid tile, ` ` void (no tile on any
   * visible layer — out of bounds for gameplay purposes).
   * Solidity folds every visible layer (any solid sprite at a cell
   * makes it solid) plus blocking placements.
   */
  walkability: string[]
  placements: AgentPlacement[]
  spawnPoints: Array<{ id: string; tileX: number; tileY: number; spawnId: string; facing?: string }>
  teleports: Array<{
    id: string
    tileX: number
    tileY: number
    targetMapId: string
    targetTileX: number
    targetTileY: number
    label?: string
  }>
}

export interface AgentPlacement {
  id: string
  name: string
  tileX: number
  tileY: number
  layerId: string
  /** Component type ids, e.g. `["visual","trigger","teleport"]`. */
  components: string[]
}

/** Look up a component of `type` on a resolved definition. */
function componentOf(def: EntityDefinition | null, type: string): Record<string, unknown> | null {
  const found = def?.components?.find((c) => c.type === type)
  return found ? (found as unknown as Record<string, unknown>) : null
}

/**
 * Build the {@link AgentMapData} projection.
 *
 * `spriteSets` maps sprite-set id → descriptor (for the per-tile
 * `solid` flags); `entityLibrary` resolves `defId` placements the
 * same way spawning does ({@link resolvePlacementDefinition} — ONE
 * resolver, see entity/data-access.ts).
 */
export function buildAgentMapData(
  mapData: MapData,
  spriteSets: ReadonlyMap<string, SpriteSetData>,
  entityLibrary: GameProjectData['entityLibrary'] = [],
): AgentMapData {
  const columns = mapData.columns ?? 0
  const rows = mapData.rows ?? 0

  // ── walkability fold: void → '.', any solid sprite → '#'
  const VOID = 0
  const WALKABLE = 1
  const SOLID = 2
  const grid = new Uint8Array(columns * rows)
  for (const layer of mapData.layers ?? []) {
    if (!layer.visible || !layer.sprites) continue
    for (const sprite of layer.sprites) {
      if (sprite.x < 0 || sprite.y < 0 || sprite.x >= columns || sprite.y >= rows) continue
      const i = sprite.y * columns + sprite.x
      if (grid[i] === SOLID) continue
      const def = spriteSets.get(sprite.spriteSetId)?.sprites?.find((s) => s.id === sprite.spriteId)
      grid[i] = def?.solid ? SOLID : Math.max(grid[i], WALKABLE)
    }
  }

  // ── placements: resolve via the canonical resolver, collect specials
  const placements: AgentPlacement[] = []
  const spawnPoints: AgentMapData['spawnPoints'] = []
  const teleports: AgentMapData['teleports'] = []
  for (const placement of mapData.objectPlacements ?? []) {
    const def = resolvePlacementDefinition(placement, entityLibrary)
    const types = def?.components?.map((c) => c.type) ?? []
    placements.push({
      id: placement.id,
      name: def?.name ?? placement.id,
      tileX: placement.tileX,
      tileY: placement.tileY,
      layerId: placement.layerId,
      components: types,
    })

    const blocking = componentOf(def, 'blocking')
    if (
      blocking &&
      placement.tileX >= 0 &&
      placement.tileY >= 0 &&
      placement.tileX < columns &&
      placement.tileY < rows
    ) {
      grid[placement.tileY * columns + placement.tileX] = SOLID
    }
    const spawn = componentOf(def, 'spawn-point')
    if (spawn) {
      spawnPoints.push({
        id: placement.id,
        tileX: placement.tileX,
        tileY: placement.tileY,
        spawnId: typeof spawn.spawnId === 'string' ? spawn.spawnId : 'player',
        facing: typeof spawn.facing === 'string' ? spawn.facing : undefined,
      })
    }
    const teleport = componentOf(def, 'teleport')
    if (teleport) {
      teleports.push({
        id: placement.id,
        tileX: placement.tileX,
        tileY: placement.tileY,
        targetMapId: String(teleport.targetMapId ?? ''),
        targetTileX: Number(teleport.targetTileX ?? 0),
        targetTileY: Number(teleport.targetTileY ?? 0),
        label: typeof teleport.label === 'string' ? teleport.label : undefined,
      })
    }
  }

  const chars = [' ', '.', '#']
  const walkability: string[] = []
  for (let y = 0; y < rows; y++) {
    let row = ''
    for (let x = 0; x < columns; x++) row += chars[grid[y * columns + x]]
    walkability.push(row)
  }

  return {
    id: mapData.id,
    name: mapData.name ?? mapData.id,
    columns,
    rows,
    tileWidth: mapData.tileWidth ?? 16,
    tileHeight: mapData.tileHeight ?? 16,
    walkability,
    placements,
    spawnPoints,
    teleports,
  }
}
