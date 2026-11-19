#!/usr/bin/env node
/**
 * Run the engine's own format validators (GameProjectFormat, MapFormat,
 * SpriteSetFormat) over a project on disk.
 *
 * usage: node scripts/bench/validate-project.mjs <game-project.json>
 *
 * The engine is TypeScript with extensionless imports and Excalibur needs
 * a `window`, so plain Node cannot import it. The entry is bundled with
 * `gjsify build --app node` into a temp directory first.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const target = process.argv[2]
if (!target) {
  process.stderr.write('usage: validate-project.mjs <game-project.json>\n')
  process.exit(2)
}

const work = mkdtempSync(join(tmpdir(), 'pixelrpg-validate-'))
try {
  const bundle = join(work, 'validate.mjs')
  const build = spawnSync(
    'gjsify',
    ['build', join(HERE, 'validate-project.entry.ts'), '--app', 'node', '--format', 'esm', '-o', bundle, '--no-minify'],
    { cwd: resolve(HERE, '../..'), encoding: 'utf8' },
  )
  if (build.status !== 0) {
    process.stderr.write(`could not bundle the validator:\n${build.stdout}${build.stderr}`)
    process.exit(1)
  }
  const run = spawnSync('node', [bundle, resolve(target)], { encoding: 'utf8' })
  process.stdout.write(run.stdout)
  process.stderr.write(run.stderr)
  process.exit(run.status ?? 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
