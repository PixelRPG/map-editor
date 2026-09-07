#!/usr/bin/env node
/**
 * Spec-registration guard.
 *
 * Each package's `src/test.mts` is HAND-MAINTAINED: `gjsify test` runs
 * only the suites imported AND passed to `run({...})` there, not every
 * `*.spec.ts` on disk. A spec that isn't registered silently never runs
 * — CI stays green while testing nothing. This has bitten the repo twice
 * (e.g. `project-operations.spec.ts`, dormant from creation until found
 * by accident).
 *
 * This guard fails (exit 1) if any spec file under a checked package's
 * `src` tree is not BOTH imported in one of that package's entries AND
 * passed to that entry's `run({...})` call. A package has `test.mts`
 * and may have `test.display.mts` — the GJS-only entry for suites that
 * build real widgets (`@pixelrpg/gjs`). A spec registered in both would
 * run twice, and a display entry the package's `test` script never runs
 * would be the same silent skip one level up, so both are failures too.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:specs` at the workspace root.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Packages whose `test.mts` registers suites (have a `test` script). */
const PACKAGES = ['packages/engine', 'packages/gjs', 'apps/maker-gjs', 'apps/signalling-server', 'apps/mcp-bridge']

/** Recursively collect `*.spec.ts` files under `dir` (skips node_modules/dist). */
function collectSpecs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectSpecs(full, acc)
    else if (entry.name.endsWith('.spec.ts')) acc.push(full)
  }
  return acc
}

/** The display-only entry a package may add beside `test.mts`. */
const DISPLAY_ENTRY = 'test.display.mts'

/**
 * What one entry registers: spec path → binding name for every
 * `import <name> from './path/to/file.spec.js'`, and the identifiers
 * actually handed to `run({...})`.
 */
function readEntry(entryPath) {
  const source = readFileSync(entryPath, 'utf8')
  const importedNameByPath = new Map()
  const importRe = /import\s+(\w+)\s+from\s+['"](\.[^'"]+\.spec\.js)['"]/g
  for (let m = importRe.exec(source); m; m = importRe.exec(source)) {
    const specPath = m[2].replace(/^\.\//, '').replace(/\.spec\.js$/, '.spec.ts')
    importedNameByPath.set(specPath, m[1])
  }
  const runMatch = source.match(/run\(\s*\{([\s\S]*?)\}\s*\)/)
  const runNames = new Set(
    (runMatch ? runMatch[1] : '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((token) => token.replace(/:.*$/, '')),
  )
  return { importedNameByPath, runNames }
}

let failures = 0

for (const pkg of PACKAGES) {
  const srcDir = join(ROOT, pkg, 'src')
  const entries = [{ file: 'test.mts', path: join(srcDir, 'test.mts') }]
  if (!existsSync(entries[0].path)) {
    console.error(`✗ [${pkg}] missing src/test.mts — cannot verify spec registration`)
    failures++
    continue
  }
  const displayPath = join(srcDir, DISPLAY_ENTRY)
  if (existsSync(displayPath)) {
    entries.push({ file: DISPLAY_ENTRY, path: displayPath })
    // The entry only exists once something runs it — `gjsify test`
    // alone never looks at it.
    const scripts = JSON.parse(readFileSync(join(ROOT, pkg, 'package.json'), 'utf8')).scripts ?? {}
    const runsDisplay = Object.values(scripts).some((cmd) => String(cmd).includes(DISPLAY_ENTRY))
    const testRunsIt =
      String(scripts.test ?? '').includes('test:display') || String(scripts.test ?? '').includes(DISPLAY_ENTRY)
    if (!runsDisplay || !testRunsIt) {
      console.error(
        `✗ [${pkg}] src/${DISPLAY_ENTRY} exists but the package's \`test\` script never runs it — its suites silently never run`,
      )
      failures++
    }
  }
  const registered = entries.map((entry) => ({ ...entry, ...readEntry(entry.path) }))

  for (const specFile of collectSpecs(srcDir)) {
    const rel = relative(srcDir, specFile).split('\\').join('/')
    const homes = registered.filter((entry) => entry.importedNameByPath.has(rel))
    if (homes.length === 0) {
      console.error(
        `✗ [${pkg}] ${rel} is NOT imported in test.mts${registered.length > 1 ? ` or ${DISPLAY_ENTRY}` : ''} — it will silently never run`,
      )
      failures++
    } else if (homes.length > 1) {
      console.error(`✗ [${pkg}] ${rel} is imported in ${homes.map((h) => h.file).join(' and ')} — it would run twice`)
      failures++
    } else {
      const [home] = homes
      const name = home.importedNameByPath.get(rel)
      if (!home.runNames.has(name)) {
        console.error(
          `✗ [${pkg}] ${rel} is imported in ${home.file} as "${name}" but NOT passed to run({...}) — it will silently never run`,
        )
        failures++
      }
    }
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} spec registration problem(s). Register each spec in its package's src/test.mts (or, for a widget suite, src/${DISPLAY_ENTRY}) — import + run().`,
  )
  process.exit(1)
}
console.log('✓ Every *.spec.ts is registered exactly once in its package test.mts / test.display.mts')
