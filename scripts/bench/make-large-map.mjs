#!/usr/bin/env node
/**
 * Write a large, loadable benchmark project into a temp directory.
 *
 * usage: node scripts/bench/make-large-map.mjs [--seed N] [--out DIR]
 *          [--size 256] [--props 2000] [--people 50] [--hostiles 20]
 *          [--fill-ground 1] [--fill-hero 0.35] [--fill-overlay 0.15]
 *          [--no-validate]
 *
 * Prints the path of the written `game-project.json` on stdout (everything
 * else goes to stderr) so a caller can pass it straight to
 * `frame-bench.py --project`.
 *
 * Why this exists: Kokiri Forest is ~16.5k ground tiles and ~300
 * placements. Depth sorting, culling and collision all change shape with
 * scale, so they need a map that is an order of magnitude denser to be
 * measured against. It is generated rather than committed — a 256×256
 * map is megabytes of JSON — and NEVER written under `games/`, where
 * Kokiri Forest stays the only example project.
 *
 * The project reuses the art of `games/zelda-like` (sprite sets copied
 * into the output directory, so it is relocatable) and the `combat-action`
 * game system. Output is a pure function of the arguments: its own PRNG,
 * no `Math.random`, no clock — the same `--seed` writes byte-identical
 * files.
 *
 * What the people do: the format has a patrol route (`npc-route`), but
 * today only `HostileAiSystem` walks it; a peaceful NPC stands still (see
 * TODO.md "Engine / runtime"). So the 50 people carry a route AND stand
 * static, and the 20 hostiles use `behaviour: 'patrol'` over their route
 * so something in the scene really moves. When the general NPC walker
 * lands, the people start walking with no regeneration.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(HERE, '../../games/zelda-like')
const SPRITESETS = ['kokiri-forest', 'link', 'scientist']

function parseArgs(argv) {
  const opts = {
    seed: 1,
    out: undefined,
    size: 256,
    props: 2000,
    people: 50,
    hostiles: 20,
    fillGround: 1,
    fillHero: 0.35,
    fillOverlay: 0.15,
    validate: true,
  }
  const numeric = {
    '--seed': 'seed',
    '--size': 'size',
    '--props': 'props',
    '--people': 'people',
    '--hostiles': 'hostiles',
    '--fill-ground': 'fillGround',
    '--fill-hero': 'fillHero',
    '--fill-overlay': 'fillOverlay',
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') opts.out = argv[++i]
    else if (arg === '--no-validate') opts.validate = false
    else if (arg in numeric) {
      const value = Number(argv[++i])
      if (!Number.isFinite(value)) throw new Error(`${arg} needs a number`)
      opts[numeric[arg]] = value
    } else throw new Error(`unknown argument ${arg}`)
  }
  return opts
}

/** mulberry32 — tiny, seedable, good enough for scattering tiles. */
function makeRng(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}

/** Real tile ids out of Kokiri Forest, so the large map looks like the art it borrows. */
function tileVocabulary() {
  const kokiri = JSON.parse(readFileSync(join(SOURCE, 'maps/kokiri-forest.json'), 'utf8'))
  const top = (plane, count) => {
    const counts = new Map()
    for (const layer of kokiri.layers.filter((l) => l.plane === plane)) {
      for (const s of layer.sprites ?? []) {
        if (s.spriteSetId !== 'kokiri-forest') continue
        counts.set(s.spriteId, (counts.get(s.spriteId) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, count)
      .map(([id]) => id)
  }
  return { ground: top('ground', 7), overlay: top('overlay', 16) }
}

function scatterLayer(rng, size, fill, ids) {
  const sprites = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (fill < 1 && rng.next() >= fill) continue
      sprites.push({ x, y, spriteId: rng.pick(ids), spriteSetId: 'kokiri-forest' })
    }
  }
  return sprites
}

function route(rng, size, cx, cy, radius) {
  const clamp = (v) => Math.max(1, Math.min(size - 2, v))
  const points = []
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    points.push({
      tileX: clamp(cx + dx * (1 + rng.int(radius))),
      tileY: clamp(cy + dy * (1 + rng.int(radius))),
    })
  }
  return points
}

function buildEntityLibrary() {
  return [
    {
      id: 'link',
      name: 'Link',
      components: [
        { type: 'visual', spriteSetId: 'link', spriteId: 5, animationId: 'idle-down' },
        { type: 'movement', tilesPerSec: 6 },
      ],
      editorData: { template: 'character', category: 'hero' },
    },
    {
      id: 'villager',
      name: 'Villager',
      components: [
        { type: 'visual', spriteSetId: 'scientist', spriteId: 0, animationId: 'idle-down' },
        { type: 'movement', tilesPerSec: 2 },
        { type: 'collision' },
      ],
      editorData: { template: 'character', category: 'npc' },
    },
    {
      id: 'goblin',
      name: 'Goblin',
      components: [
        { type: 'visual', spriteSetId: 'scientist', spriteId: 0, animationId: 'idle-down' },
        { type: 'movement', tilesPerSec: 2 },
        { type: 'stats', maxHp: 3, hp: 3, attack: 0, defense: 0 },
        { type: 'hostile', behaviour: 'patrol', aggroTiles: 4, contactDamage: 1 },
        { type: 'hurtbox' },
        { type: 'collision' },
      ],
      editorData: { template: 'enemy', category: 'hostile' },
    },
    {
      id: 'tree',
      name: 'Tree',
      components: [{ type: 'visual', spriteSetId: 'kokiri-forest', spriteId: 495 }, { type: 'collision' }],
      editorData: { template: 'custom', category: 'prop' },
    },
    {
      id: 'bush',
      name: 'Bush',
      components: [{ type: 'visual', spriteSetId: 'kokiri-forest', spriteId: 496 }],
      editorData: { template: 'custom', category: 'prop' },
    },
  ]
}

function buildMap(opts, rng) {
  const { size } = opts
  const vocabulary = tileVocabulary()
  const center = Math.floor(size / 2)
  const occupied = new Set([`${center},${center}`])
  const free = () => {
    for (;;) {
      const tileX = 1 + rng.int(size - 2)
      const tileY = 1 + rng.int(size - 2)
      const key = `${tileX},${tileY}`
      // Keep the spawn clearing empty so the hero is not born inside a tree.
      if (Math.abs(tileX - center) < 4 && Math.abs(tileY - center) < 4) continue
      if (occupied.has(key)) continue
      occupied.add(key)
      return { tileX, tileY }
    }
  }

  const placements = []
  const place = (prefix, index, defId, extra = {}) => {
    const { tileX, tileY } = free()
    placements.push({ id: `${prefix}-${index}`, layerId: 'layer_hero', tileX, tileY, defId, ...extra })
    return { tileX, tileY }
  }
  for (let i = 0; i < opts.props; i++) place('prop', i, rng.next() < 0.4 ? 'tree' : 'bush')
  for (let i = 0; i < opts.people; i++) {
    const at = free()
    occupied.delete(`${at.tileX},${at.tileY}`)
    const spot = place('npc', i, 'villager', {})
    placements[placements.length - 1].overrides = {
      name: `Villager ${i + 1}`,
      components: [{ type: 'npc-route', waypoints: route(rng, size, spot.tileX, spot.tileY, 3), facing: 'down' }],
    }
  }
  for (let i = 0; i < opts.hostiles; i++) {
    const spot = place('hostile', i, 'goblin')
    placements[placements.length - 1].overrides = {
      components: [{ type: 'npc-route', waypoints: route(rng, size, spot.tileX, spot.tileY, 4), facing: 'down' }],
    }
  }

  return {
    id: 'large-map',
    name: 'Large map (bench)',
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: size,
    rows: size,
    spriteSets: [{ id: 'kokiri-forest', path: '../spritesets/kokiri-forest.json', type: 'spriteset', firstGid: 1 }],
    layers: [
      {
        id: 'layer_ground',
        name: 'Ground',
        visible: true,
        plane: 'ground',
        sprites: scatterLayer(rng, size, opts.fillGround, vocabulary.ground),
      },
      {
        id: 'layer_hero',
        name: 'Hero',
        visible: true,
        plane: 'hero',
        sprites: scatterLayer(rng, size, opts.fillHero, vocabulary.overlay),
      },
      {
        id: 'layer_overlay',
        name: 'Overlay',
        visible: true,
        plane: 'overlay',
        sprites: scatterLayer(rng, size, opts.fillOverlay, vocabulary.overlay),
      },
    ],
    objectPlacements: placements,
    editorData: { atlasX: 0, atlasY: 0 },
  }
}

function buildProject(opts) {
  const center = Math.floor(opts.size / 2) * 16
  const reference = (id, category) => ({ id, path: `./spritesets/${id}.json`, type: 'spriteset', category })
  return {
    version: '1.0.0',
    id: 'large-map-bench',
    name: 'Large map (bench)',
    startup: { initialMapId: 'large-map', initialX: center, initialY: center, initialDirection: 'down' },
    maps: [{ id: 'large-map', name: 'Large map', path: './maps/large-map.json', type: 'map', category: 'overworld' }],
    mapCategories: [{ id: 'overworld', name: 'Overworld Maps' }],
    spriteSets: [
      reference('kokiri-forest', 'environments'),
      reference('scientist', 'characters'),
      reference('link', 'characters'),
    ],
    properties: { gameTitle: 'Large map (bench)', author: 'generated', version: '0.0.0', defaultTileSize: 16 },
    entityLibrary: buildEntityLibrary(),
    playerActorId: 'link',
    gameSystems: { 'combat-action': { enabled: true } },
  }
}

/** Structural checks that need no engine; the engine validators run in `validateWithEngine`. */
function selfCheck(project, map) {
  const fail = (msg) => {
    throw new Error(`generated project is inconsistent: ${msg}`)
  }
  const library = new Set(project.entityLibrary.map((d) => d.id))
  const layers = new Map(map.layers.map((l) => [l.id, l]))
  const seen = new Set()
  for (const p of map.objectPlacements) {
    if (seen.has(p.id)) fail(`duplicate placement id ${p.id}`)
    seen.add(p.id)
    if (!library.has(p.defId)) fail(`placement ${p.id} → unknown def ${p.defId}`)
    if (layers.get(p.layerId)?.plane !== 'hero') fail(`placement ${p.id} is not on the hero plane`)
    if (p.tileX < 0 || p.tileY < 0 || p.tileX >= map.columns || p.tileY >= map.rows) fail(`${p.id} out of bounds`)
  }
  for (const layer of map.layers) {
    for (const s of layer.sprites) {
      if (s.x < 0 || s.y < 0 || s.x >= map.columns || s.y >= map.rows) fail(`${layer.id} sprite out of bounds`)
    }
  }
}

/** Run the engine's own format validators; never skipped silently. */
function validateWithEngine(projectPath) {
  const runner = join(HERE, 'validate-project.mjs')
  const result = spawnSync('node', [runner, projectPath], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`engine validation failed:\n${result.stdout}${result.stderr}`)
  process.stderr.write(result.stdout)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const rng = makeRng(opts.seed)
  const out = resolve(opts.out ?? mkdtempSync(join(tmpdir(), `pixelrpg-large-map-s${opts.seed}-`)))
  if (/(^|\/)games(\/|$)/.test(out) && out.startsWith(resolve(HERE, '../..'))) {
    throw new Error('refusing to write into games/ — Kokiri Forest stays the only example project')
  }

  const map = buildMap(opts, rng)
  const project = buildProject(opts)
  selfCheck(project, map)

  mkdirSync(join(out, 'maps'), { recursive: true })
  mkdirSync(join(out, 'spritesets'), { recursive: true })
  for (const id of SPRITESETS) {
    for (const ext of ['json', 'png']) {
      copyFileSync(join(SOURCE, 'spritesets', `${id}.${ext}`), join(out, 'spritesets', `${id}.${ext}`))
    }
  }
  const projectPath = join(out, 'game-project.json')
  writeFileSync(join(out, 'maps/large-map.json'), `${JSON.stringify(map)}\n`)
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`)

  const count = (plane) => map.layers.find((l) => l.plane === plane).sprites.length
  process.stderr.write(
    `seed ${opts.seed}: ${opts.size}×${opts.size} · tiles ground ${count('ground')} / hero ${count('hero')} / overlay ${count('overlay')}` +
      ` · placements ${map.objectPlacements.length} (${opts.props} props, ${opts.people} people, ${opts.hostiles} hostiles)\n`,
  )
  if (opts.validate) validateWithEngine(projectPath)
  process.stdout.write(`${projectPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
