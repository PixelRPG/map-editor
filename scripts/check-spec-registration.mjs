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
 * `src` tree is not BOTH imported in that package's `test.mts` AND
 * passed to its `run({...})` call.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:specs` at the workspace root.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Packages whose `test.mts` registers suites (have a `test` script). */
const PACKAGES = ['packages/engine', 'apps/maker-gjs', 'apps/signalling-server']

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

let failures = 0

for (const pkg of PACKAGES) {
  const srcDir = join(ROOT, pkg, 'src')
  const testMts = join(srcDir, 'test.mts')
  let testSrc
  try {
    testSrc = readFileSync(testMts, 'utf8')
  } catch {
    console.error(`✗ [${pkg}] missing src/test.mts — cannot verify spec registration`)
    failures++
    continue
  }

  // `import <name> from './path/to/file.spec.js'` → map the resolved
  // source path (`.spec.ts`) to its binding name.
  const importedNameByPath = new Map()
  const importRe = /import\s+(\w+)\s+from\s+['"](\.[^'"]+\.spec\.js)['"]/g
  for (let m = importRe.exec(testSrc); m; m = importRe.exec(testSrc)) {
    const name = m[1]
    const specPath = m[2].replace(/^\.\//, '').replace(/\.spec\.js$/, '.spec.ts')
    importedNameByPath.set(specPath, name)
  }

  // Identifiers actually handed to `run({...})`.
  const runMatch = testSrc.match(/run\(\s*\{([\s\S]*?)\}\s*\)/)
  const runNames = new Set(
    (runMatch ? runMatch[1] : '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((token) => token.replace(/:.*$/, '')),
  )

  for (const specFile of collectSpecs(srcDir)) {
    const rel = relative(srcDir, specFile).split('\\').join('/')
    const name = importedNameByPath.get(rel)
    if (!name) {
      console.error(`✗ [${pkg}] ${rel} is NOT imported in test.mts — it will silently never run`)
      failures++
    } else if (!runNames.has(name)) {
      console.error(`✗ [${pkg}] ${rel} is imported as "${name}" but NOT passed to run({...}) — it will silently never run`)
      failures++
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} unregistered spec file(s). Add each to its package's src/test.mts (import + run()).`)
  process.exit(1)
}
console.log('✓ Every *.spec.ts is registered in its package test.mts')
