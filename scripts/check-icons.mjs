#!/usr/bin/env node
/**
 * Icon-name guard.
 *
 * Every `*-symbolic` icon name written in a .ts / .blp / .ui / .css file must
 * be either bundled by the maker (an SVG under apps/maker-gjs/data/icons/) or
 * listed in scripts/stock-icons.txt, the pinned names known to exist in the
 * Adwaita theme of the target GNOME runtime. A name that is neither renders
 * as a broken-image icon at runtime, and nothing else reports it (this
 * shipped for `emblem-ok-symbolic`, which Adwaita does not have).
 *
 * Spec files are skipped: their icon strings are test fixtures, not UI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['apps', 'packages', 'games']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'refs', '.git', 'bench'])
const SOURCE = /\.(ts|blp|ui|css)$/
const NAME = /[a-z][a-z0-9-]*-symbolic(?![a-z0-9-])/g

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), []))
const bundled = new Set(
  files.filter((f) => f.includes('/data/icons/') && f.endsWith('.svg')).map((f) => basename(f, '.svg')),
)
const stock = new Set(
  readFileSync(join(ROOT, 'scripts/stock-icons.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
)

const bad = []
for (const file of files) {
  if (!SOURCE.test(file) || file.endsWith('.spec.ts') || file.endsWith('.d.blp.ts')) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const name of line.match(NAME) ?? []) {
      if (!bundled.has(name) && !stock.has(name)) bad.push(`${file.slice(ROOT.length)}:${i + 1}  ${name}`)
    }
  })
}

if (bad.length > 0) {
  console.error('Icon names that are neither bundled nor in scripts/stock-icons.txt:\n')
  for (const b of bad) console.error(`  ${b}`)
  console.error('\nBundle an SVG under apps/maker-gjs/data/icons/ or use a stock name.')
  process.exit(1)
}
console.log(`check:icons ok (${bundled.size} bundled, ${stock.size} stock)`)
