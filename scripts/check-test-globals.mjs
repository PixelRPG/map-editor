#!/usr/bin/env node
/**
 * Node-test-globals ordering guard.
 *
 * `@pixelrpg/engine`'s `node-test-globals` defines the `window` global that
 * excalibur's module-init `polyfill()` assigns to, and it only works as the
 * FIRST import of a package's test entry: ESM evaluates every imported
 * module's body before the importing module's body, so the shim lands in the
 * emitted bundle in import order. Anywhere else in the entry it runs after
 * the excalibur body that needs it, and the whole node leg dies at load with
 * `ReferenceError: window is not defined`.
 *
 * That failure is LOUD, so this guard exists for the other direction: the
 * inline-shim version of this shim sat at the top of the engine's `test.mts`
 * for a long time and could never fire, because hoisting puts an entry's own
 * statements last no matter where they are written. It went unnoticed because
 * gjsify 0.53 stopped defining `window` for `--app node` (ADR 0079 upstream),
 * which is the only reason the node leg was green before that.
 *
 * So: fail if an entry imports the shim but not first, which is the state in
 * which it reads correct and does nothing.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:test-globals` at the workspace root.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Test entries whose node leg runs (each package's `test` script). */
const ENTRIES = ['packages/engine/src/test.mts', 'packages/gjs/src/test.mts', 'apps/maker-gjs/src/test.mts']

const SPECIFIER = '@pixelrpg/engine/node-test-globals'

/** The first import specifier in `source`, or undefined when it has none. */
function firstImportSpecifier(source) {
  const match = /^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/m.exec(source)
  return match?.[1]
}

const failures = []

for (const entry of ENTRIES) {
  const path = join(ROOT, entry)
  if (!existsSync(path)) continue
  const source = readFileSync(path, 'utf8')
  if (!source.includes(SPECIFIER)) {
    failures.push(`${entry}: does not import ${SPECIFIER} — its node leg cannot load excalibur`)
    continue
  }
  const first = firstImportSpecifier(source)
  if (first !== SPECIFIER) {
    failures.push(
      `${entry}: imports ${SPECIFIER} but the first import is ${JSON.stringify(first)} — the shim runs after the excalibur body it must precede`,
    )
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure}`)
  process.exit(1)
}

console.log(`node-test-globals first in ${ENTRIES.length} test entr${ENTRIES.length === 1 ? 'y' : 'ies'}`)
