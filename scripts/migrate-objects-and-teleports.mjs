#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Migrate legacy object/teleport schemas to the new Definition/Placement
 * model documented in `docs/concepts/object-system.md`.
 *
 * Walks every `games/<name>/game-project.json` + the maps + sprite-sets
 * it references. Rewrites them in place.
 *
 * Transformations:
 *
 * 1. **`GameProjectData.teleports[]`** → per-map inline
 *    `ObjectPlacement` entries with `kind: 'teleport'`. Project-level
 *    array removed. If a map has no suitable "events" layer, one is
 *    added (visible, no sprites).
 *
 * 2. **`LayerData.type === 'object'` + `LayerData.objects[]`** →
 *    flat `MapData.objectPlacements[]`. Layer's `type` and `objects`
 *    fields are removed; the layer survives (sprites: []) and serves
 *    purely as a sort/visibility grouping for objects that reference
 *    its id via `layerId`. Pixel positions snap to tile grid via
 *    `Math.round(x / tileWidth)`.
 *
 * 3. **`LayerData.type === 'tile'`** → `type` field dropped (every
 *    layer is a tile layer now).
 *
 * 4. **Legacy `ObjectData.type` discriminator** → new `ObjectKind`:
 *    - 'collider' → 'custom' with `blocking: true`
 *    - 'trigger' → 'event'
 *    - 'spawn' → 'spawn-point'
 *    - 'sprite' / 'custom' → 'custom'
 *
 * 5. **Sprite-set `tileProperties` heuristic backfill**: tiles whose
 *    `name` matches known surface types get a default
 *    `tileProperties` block. Water-like tiles also get `walkable:
 *    false`. Easy to tune manually after.
 *
 * Idempotent — re-running on already-migrated files is a no-op.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const GAMES_DIR = resolve(ROOT, 'games')

let touchedFiles = 0

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null
  const next = `${JSON.stringify(value, null, 2)}\n`
  if (before !== next) {
    writeFileSync(path, next)
    touchedFiles++
    console.log(`  wrote ${path}`)
  }
}

// ---------------------------------------------------------------------------
// Legacy ObjectData.type → new ObjectKind mapping
// ---------------------------------------------------------------------------

function legacyTypeToKind(legacyType) {
  switch (legacyType) {
    case 'spawn':
      return 'spawn-point'
    case 'trigger':
      return 'event'
    case 'collider':
      return 'custom'
    case 'sprite':
      return 'custom'
    case 'custom':
    default:
      return 'custom'
  }
}

function legacyTypeImpliesBlocking(legacyType) {
  // Collider zones were inherently blocking. Everything else: keep the
  // conservative default and let the editor user tune.
  return legacyType === 'collider'
}

// ---------------------------------------------------------------------------
// Map-level migration
// ---------------------------------------------------------------------------

const EVENTS_LAYER_ID = 'events'

function ensureEventsLayer(mapData) {
  const existing = mapData.layers.find((l) => l.id === EVENTS_LAYER_ID)
  if (existing) return existing
  const layer = { id: EVENTS_LAYER_ID, name: 'Events', visible: true, sprites: [] }
  mapData.layers.push(layer)
  return layer
}

function migrateMap(mapPath) {
  const mapData = readJson(mapPath)
  const tileWidth = mapData.tileWidth ?? 16
  const tileHeight = mapData.tileHeight ?? 16

  const placements = Array.isArray(mapData.objectPlacements) ? [...mapData.objectPlacements] : []
  let counter = placements.length

  // Walk each layer and migrate legacy object payloads.
  for (const layer of mapData.layers) {
    if (Array.isArray(layer.objects) && layer.objects.length > 0) {
      for (const obj of layer.objects) {
        counter++
        const kind = legacyTypeToKind(obj.type)
        const blocking = legacyTypeImpliesBlocking(obj.type) ? true : undefined
        const tileX = Math.round((obj.x ?? 0) / tileWidth)
        const tileY = Math.round((obj.y ?? 0) / tileHeight)
        const placement = {
          id: `p-${layer.id}-${obj.id ?? counter}`,
          layerId: layer.id,
          tileX,
          tileY,
          inline: {
            id: `def-${layer.id}-${obj.id ?? counter}`,
            kind,
            name: obj.name || `Object ${obj.id ?? counter}`,
            ...(blocking !== undefined ? { blocking } : {}),
            ...(obj.properties ? { properties: { ...obj.properties } } : {}),
          },
        }
        placements.push(placement)
      }
    }

    // Drop deprecated fields from every layer.
    if ('type' in layer) delete layer.type
    if ('objects' in layer) delete layer.objects
  }

  if (placements.length > 0) {
    mapData.objectPlacements = placements
  } else if ('objectPlacements' in mapData) {
    // Idempotency: keep an explicit empty array off the file if nothing
    // landed in it. Less JSON noise for plain tile-only maps.
    delete mapData.objectPlacements
  }

  return mapData
}

// ---------------------------------------------------------------------------
// Project-level migration — teleports[] → per-map inline placements
// ---------------------------------------------------------------------------

function migrateProject(projectPath) {
  const project = readJson(projectPath)
  const projectDir = dirname(projectPath)

  // First, load every map referenced by the project so we can mutate
  // them inline. Track them by mapId.
  const maps = new Map()
  for (const ref of project.maps ?? []) {
    const mapPath = resolve(projectDir, ref.path)
    if (!existsSync(mapPath)) {
      console.warn(`  skip unknown map ref: ${ref.id} (${mapPath})`)
      continue
    }
    maps.set(ref.id, { ref, mapPath, mapData: migrateMap(mapPath) })
  }

  // Move project-level `teleports[]` entries into the source map as
  // inline ObjectPlacements. The atlas overlay will rebuild the curve
  // visualisation by aggregating placements across all maps.
  const teleports = Array.isArray(project.teleports) ? project.teleports : []
  for (const t of teleports) {
    const sourceMap = maps.get(t.from?.mapId)
    if (!sourceMap) {
      console.warn(`  drop teleport "${t.id}" — source map "${t.from?.mapId}" not in project`)
      continue
    }
    ensureEventsLayer(sourceMap.mapData)
    const placements = (sourceMap.mapData.objectPlacements ??= [])
    placements.push({
      id: `p-${t.id}`,
      layerId: EVENTS_LAYER_ID,
      tileX: t.from.x,
      tileY: t.from.y,
      inline: {
        id: `def-${t.id}`,
        kind: 'teleport',
        name: t.label || t.id,
        trigger: { on: 'walk-onto' },
        properties: {
          targetMapId: t.to.mapId,
          targetTileX: t.to.x,
          targetTileY: t.to.y,
          ...(t.label ? { label: t.label } : {}),
        },
      },
    })
  }
  delete project.teleports

  // Write maps back out. Each migrated map gets its own writeJson —
  // idempotent in the same run if `migrateMap` didn't change anything.
  for (const { mapPath, mapData } of maps.values()) {
    writeJson(mapPath, mapData)
  }

  // Write the project file.
  writeJson(projectPath, project)
}

// ---------------------------------------------------------------------------
// Sprite-set heuristic backfill
// ---------------------------------------------------------------------------

const SURFACE_KEYWORDS = [
  { match: /^water$|^deep water$|^pond$/i, props: { walkable: false, surface: 'water' } },
  { match: /^stone$|^wall$/i, props: { surface: 'stone' } },
  { match: /^grass$/i, props: { surface: 'grass' } },
  { match: /^sand$|^path$/i, props: { surface: 'sand' } },
  { match: /^tree$|^bush$/i, props: { walkable: false, surface: 'wood' } },
  { match: /^door$/i, props: { surface: 'wood' } },
]

function migrateSpriteSet(spriteSetPath) {
  const data = readJson(spriteSetPath)
  if (!Array.isArray(data.sprites)) return
  let changed = false
  for (const sprite of data.sprites) {
    if (!sprite.name) continue
    if (sprite.tileProperties) continue // never overwrite manual edits
    const hit = SURFACE_KEYWORDS.find((r) => r.match.test(sprite.name))
    if (hit) {
      sprite.tileProperties = { ...hit.props }
      changed = true
    }
  }
  if (changed) writeJson(spriteSetPath, data)
}

// ---------------------------------------------------------------------------
// Walk games/
// ---------------------------------------------------------------------------

const gameDirs = readdirSync(GAMES_DIR).filter((name) => {
  const stat = statSync(resolve(GAMES_DIR, name))
  return stat.isDirectory()
})

for (const game of gameDirs) {
  const projectPath = resolve(GAMES_DIR, game, 'game-project.json')
  if (!existsSync(projectPath)) continue
  console.log(`migrating ${game}/`)
  migrateProject(projectPath)

  // Sprite-set backfill — walk spritesets/*.json siblings.
  const spritesetsDir = resolve(GAMES_DIR, game, 'spritesets')
  if (existsSync(spritesetsDir)) {
    for (const entry of readdirSync(spritesetsDir)) {
      if (!entry.endsWith('.json')) continue
      migrateSpriteSet(resolve(spritesetsDir, entry))
    }
  }
}

console.log(`\nDone. ${touchedFiles} file(s) written.`)
