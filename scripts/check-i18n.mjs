#!/usr/bin/env node
/**
 * Translation-catalogue guard.
 *
 * `packages/translations` extracts every `_()` / `N_()` / `ngettext` call in the `.ts` and
 * `.blp` sources into `org.pixelrpg.maker.pot` and merges it into each `<lang>.po`. A new UI
 * string that nobody extracted is not an error anywhere: the app runs, the tests pass, and the
 * German user sees one English label among German ones. This guard fails (exit 1) if
 *  - re-running the extraction changes the committed `.pot` or any `.po` (stale catalogue), or
 *  - a `.po` has an untranslated or fuzzy entry, or `msgfmt --check` rejects it.
 *
 * Fix: `npm run i18n:extract`, translate the new entries in `de.po`, commit both.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'translations')
const catalogues = () => readdirSync(dir).filter((f) => f.endsWith('.pot') || f.endsWith('.po')).sort()
const snapshot = () => Object.fromEntries(catalogues().map((f) => [f, readFileSync(join(dir, f), 'utf8')]))

const before = snapshot()
execFileSync('gjsify', ['workspace', '@pixelrpg/translations', 'build'], { cwd: join(dir, '..', '..'), stdio: 'pipe' })
const after = snapshot()

const problems = []
for (const f of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (before[f] !== after[f]) problems.push(`${f} is stale — re-run \`npm run i18n:extract\` and commit it`)
}
for (const f of catalogues().filter((n) => n.endsWith('.po'))) {
  try {
    const out = execFileSync('msgfmt', ['--check', '--statistics', '-o', '/dev/null', join(dir, f)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    void out
  } catch (e) {
    problems.push(`${f}: msgfmt --check failed: ${String(e.stderr || e.message).trim()}`)
  }
  const stats = execFileSync('sh', ['-c', `msgfmt --statistics -o /dev/null "${join(dir, f)}" 2>&1`], { encoding: 'utf8' })
  if (/unübersetzt|untranslated|fuzzy|ungenau/i.test(stats)) problems.push(`${f}: ${stats.trim()}`)
}

if (problems.length > 0) {
  console.error('i18n guard failed:\n - ' + problems.join('\n - '))
  process.exit(1)
}
console.log(`i18n guard ok (${catalogues().join(', ')})`)
