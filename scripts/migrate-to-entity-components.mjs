#!/usr/bin/env node
/**
 * One-shot migration: the shipped `kind`-discriminated object model →
 * the entity-composition model (`docs/concepts/entity-and-appearance-model.md`).
 *
 * For every `games/<name>/`:
 *   - `game-project.json`: `objectLibrary[]` → `entityLibrary[]` (each
 *     legacy `ObjectDefinition` → an `EntityDefinition` with `components[]`).
 *   - each map JSON: every `objectPlacements[].inline` (a legacy definition)
 *     → an `EntityDefinition`; `overrides` reshaped to `{ name?, components? }`.
 *
 * Idempotent — a file is only rewritten when its JSON changes, and an
 * already-migrated definition (one that has `components[]`) is left as-is.
 * The transform mirrors `packages/engine/src/entity/convert.ts`
 * (`objectDefinitionToEntity`), kept in sync by `convert.spec.ts`.
 *
 * Usage: `node scripts/migrate-to-entity-components.mjs`
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const GAMES_DIR = resolve(ROOT, 'games')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

let changedCount = 0
function writeJson(path, value) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null
  const next = `${JSON.stringify(value, null, 2)}\n`
  if (before !== next) {
    writeFileSync(path, next)
    changedCount++
    console.log(`  updated ${path.replace(`${ROOT}/`, '')}`)
  }
}

/** Mirror of `objectDefinitionToEntity` in entity/convert.ts. */
function objectDefinitionToEntity(def) {
  if (def && Array.isArray(def.components)) return def // already migrated
  const components = []
  const props = def.properties ?? {}

  if (def.sprite) {
    components.push({
      type: 'visual',
      spriteSetId: def.sprite.spriteSetId,
      spriteId: def.sprite.spriteId,
      ...(def.sprite.animationId ? { animationId: def.sprite.animationId } : {}),
    })
  }
  if (def.trigger) {
    components.push({
      type: 'trigger',
      on: def.trigger.on,
      ...(def.trigger.once !== undefined ? { once: def.trigger.once } : {}),
      ...(def.trigger.scriptId ? { scriptId: def.trigger.scriptId } : {}),
    })
  }
  if (def.blocking === true) components.push({ type: 'collision' })

  switch (def.kind) {
    case 'teleport':
      if (typeof props.targetMapId === 'string') {
        components.push({
          type: 'teleport',
          targetMapId: props.targetMapId,
          targetTileX: Number(props.targetTileX) || 0,
          targetTileY: Number(props.targetTileY) || 0,
          ...(props.facing ? { facing: props.facing } : {}),
          ...(props.label ? { label: props.label } : {}),
        })
      }
      break
    case 'item':
      if (typeof props.itemId === 'string') {
        components.push({
          type: 'item',
          itemId: props.itemId,
          ...(props.qty !== undefined ? { qty: Number(props.qty) } : {}),
          ...(props.pickupSound ? { pickupSound: props.pickupSound } : {}),
        })
      }
      break
    case 'npc':
      if (typeof props.dialogueId === 'string') components.push({ type: 'dialogue', dialogueId: props.dialogueId })
      if (Array.isArray(props.route)) {
        components.push({ type: 'npc-route', waypoints: props.route, ...(props.facing ? { facing: props.facing } : {}) })
      }
      break
    case 'spawn-point':
      components.push({
        type: 'spawn-point',
        spawnId: typeof props.spawnId === 'string' ? props.spawnId : 'player',
        ...(props.facing ? { facing: props.facing } : {}),
      })
      break
    default:
      break
  }

  const custom = props.custom
  if (custom && typeof custom === 'object' && Object.keys(custom).length > 0) {
    components.push({ type: 'custom-data', data: custom })
  }

  return {
    id: def.id,
    name: def.name,
    components,
    editorData: {
      template: def.kind,
      ...(def.editorData?.category ? { category: def.editorData.category } : {}),
      ...(def.editorData?.icon ? { icon: def.editorData.icon } : {}),
    },
  }
}

/** Reshape a placement's legacy overrides to `{ name?, components? }`. */
function migrateOverrides(overrides) {
  if (!overrides) return undefined
  if (overrides.components !== undefined || Object.keys(overrides).every((k) => k === 'name' || k === 'components')) {
    return overrides // already new shape (or name-only)
  }
  // Legacy override fields (sprite/trigger/properties/blocking) → components.
  const synthetic = objectDefinitionToEntity({ id: 'o', name: overrides.name ?? 'o', kind: 'custom', ...overrides })
  const next = { components: synthetic.components }
  if (overrides.name) next.name = overrides.name
  return next
}

function migrateProject(projectPath) {
  const data = readJson(projectPath)
  let dirty = false
  if (Array.isArray(data.objectLibrary)) {
    data.entityLibrary = data.objectLibrary.map(objectDefinitionToEntity)
    delete data.objectLibrary
    dirty = true
  }
  if (dirty) writeJson(projectPath, data)
}

function migrateMap(mapPath) {
  const data = readJson(mapPath)
  if (!Array.isArray(data.objectPlacements) || data.objectPlacements.length === 0) return
  let dirty = false
  for (const placement of data.objectPlacements) {
    if (placement.inline && !Array.isArray(placement.inline.components)) {
      placement.inline = objectDefinitionToEntity(placement.inline)
      dirty = true
    }
    if (placement.overrides) {
      const migrated = migrateOverrides(placement.overrides)
      if (JSON.stringify(migrated) !== JSON.stringify(placement.overrides)) {
        placement.overrides = migrated
        dirty = true
      }
    }
  }
  if (dirty) writeJson(mapPath, data)
}

const gameDirs = readdirSync(GAMES_DIR).filter((name) => statSync(resolve(GAMES_DIR, name)).isDirectory())
for (const game of gameDirs) {
  console.log(`games/${game}:`)
  const projectPath = resolve(GAMES_DIR, game, 'game-project.json')
  if (existsSync(projectPath)) migrateProject(projectPath)
  const mapsDir = resolve(GAMES_DIR, game, 'maps')
  if (existsSync(mapsDir)) {
    for (const f of readdirSync(mapsDir).filter((n) => n.endsWith('.json'))) {
      migrateMap(resolve(mapsDir, f))
    }
  }
}
console.log(changedCount === 0 ? 'No changes (already migrated).' : `Done — ${changedCount} file(s) updated.`)
