#!/usr/bin/env node
// One-shot porter: copies Tiled .tsx per-tile collision data into our
// .json sprite-set format. For each tile that has an <objectgroup> in
// the Tiled source, the matching sprite in the JSON gains:
//   - solid: true (engine binary flag — sets tile.solid on the
//     Excalibur TileMap via MapResource.processTileLayer)
//   - colliders: ColliderShape[] (shape-accurate data preserved for
//     future use when the engine supports non-box tile collision)
// Idempotent: re-running overwrites the same fields. Existing
// non-ported fields (name, tags, tileProperties, …) are preserved.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PAIRS = [
  { tsx: 'games/zelda-like/spritesets/lokiri-forest.tsx', json: 'games/zelda-like/spritesets/lokiri-forest.json' },
  { tsx: 'games/zelda-like/spritesets/water.tsx', json: 'games/zelda-like/spritesets/water.json' },
]

function parseAttrs(text) {
  const out = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(text)) !== null) out[m[1]] = m[2]
  return out
}

function parseTiledColliders(tsxText) {
  const out = new Map()
  const tileRe = /<tile id="(\d+)">([\s\S]*?)<\/tile>/g
  let tileMatch
  while ((tileMatch = tileRe.exec(tsxText)) !== null) {
    const id = Number(tileMatch[1])
    const body = tileMatch[2]
    if (!body.includes('<objectgroup')) continue
    const colliders = []
    const objRe = /<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g
    let objMatch
    while ((objMatch = objRe.exec(body)) !== null) {
      const attrs = parseAttrs(objMatch[1])
      const inner = objMatch[2] ?? ''
      const x = Number(attrs.x ?? 0)
      const y = Number(attrs.y ?? 0)
      const w = attrs.width !== undefined ? Number(attrs.width) : undefined
      const h = attrs.height !== undefined ? Number(attrs.height) : undefined
      const rotation = Number(attrs.rotation ?? 0)
      if (rotation !== 0 && rotation !== 360 && rotation !== 180 && rotation !== -180) {
        console.warn(`[port] tile ${id}: non-trivial rotation ${rotation} — collider dropped`)
        continue
      }
      if (inner.includes('<polygon')) {
        const pts = inner.match(/<polygon\s+points="([^"]+)"/)
        if (!pts) continue
        const points = pts[1]
          .split(/\s+/)
          .filter(Boolean)
          .map((pair) => {
            const [px, py] = pair.split(',').map(Number)
            const flip = rotation === 180 || rotation === -180
            return { x: x + (flip ? -px : px), y: y + (flip ? -py : py) }
          })
        colliders.push({ type: 'polygon', points })
        continue
      }
      if (inner.includes('<ellipse')) {
        if (w === undefined || h === undefined) continue
        const radius = Math.min(w, h) / 2
        colliders.push({ type: 'circle', radius, offset: { x: x + radius, y: y + radius } })
        continue
      }
      if (w !== undefined && h !== undefined) {
        colliders.push({ type: 'rectangle', width: w, height: h, offset: { x, y } })
        continue
      }
      console.warn(`[port] tile ${id}: object without recognised shape — skipped`)
    }
    if (colliders.length) out.set(id, colliders)
  }
  return out
}

async function portOne(pair) {
  const tsxText = await readFile(resolve(pair.tsx), 'utf8')
  const jsonText = await readFile(resolve(pair.json), 'utf8')
  const data = JSON.parse(jsonText)
  const collidersById = parseTiledColliders(tsxText)
  let updated = 0
  let cleared = 0
  for (const sprite of data.sprites) {
    const colliders = collidersById.get(sprite.id)
    if (colliders) {
      sprite.solid = true
      sprite.colliders = colliders
      updated += 1
    } else if (sprite.solid === true && sprite.colliders !== undefined) {
      // Idempotency: clear flags that look auto-ported when the source
      // tile no longer has collision objects. Manual `solid: true`
      // (without colliders array) is left alone.
      delete sprite.solid
      delete sprite.colliders
      cleared += 1
    }
  }
  await writeFile(resolve(pair.json), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`[port] ${pair.json}: ${updated} solid, ${cleared} cleared (of ${data.sprites.length} sprites)`)
}

for (const pair of PAIRS) {
  try {
    await portOne(pair)
  } catch (err) {
    console.error(`[port] Failed for ${pair.json}:`, err)
    process.exitCode = 1
  }
}
