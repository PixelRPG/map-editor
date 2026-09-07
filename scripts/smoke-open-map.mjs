#!/usr/bin/env node
/**
 * Smoke check: start the built maker, open a shipped project, open a map,
 * and assert the editor actually comes up able to edit it.
 *
 * WHY THIS EXISTS. Nine structural guards and five unit suites were green
 * while opening a map intermittently left the editor on an empty scene for
 * the rest of the session. Every one of them checks shape; none of them
 * starts the app and asks whether it works. This one does.
 *
 * WHAT IT ASSERTS, and why all four:
 *   view           === 'scene-editor'   the editor is where it claims
 *   enginePresent  === true             a canvas widget exists
 *   engineReady    === true             Excalibur is live on it
 *   currentSceneId === the map asked for
 *   activeLayer    !== null             a paint target is actually planted
 *
 * `activeLayer` is the load-bearing one. `engineReady` was true in every
 * single run of the scenario that was broken — an engine with no map on it
 * still reports ready. A check that stops at `engineReady` reports green on
 * an editor you cannot paint in, which is precisely the gap that let the
 * defect sit.
 *
 * Usage:
 *   node scripts/smoke-open-map.mjs [--runs N] [--project ID] [--map ID]
 *                                   [--second-map ID] [--timeout MS]
 *
 * Needs, in the environment: a session D-Bus (`dbus-run-session`), a
 * compositor on $WAYLAND_DISPLAY, and a working GL stack. See
 * scripts/smoke/README.md.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}

const RUNS = Number(opt('runs', '3'))
const PROJECT_ID = opt('project', 'zelda-like')
const MAP_ID = opt('map', 'kokiri-forest')
const SECOND_MAP_ID = opt('second-map', 'tree-house')
const TIMEOUT_MS = Number(opt('timeout', '60000'))

const BIN = join(ROOT, 'apps/maker-gjs/org.pixelrpg.maker')
const PROJECT = join(ROOT, 'games', PROJECT_ID, 'game-project.json')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run a command, resolving to `{ code, stdout }` and never rejecting. */
function run(cmd, argv, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: '' })
    })
  })
}

const control = (label, method, ...rest) =>
  run('gdbus', [
    'call',
    '--session',
    '--dest',
    `org.pixelrpg.maker.${label}`,
    '--object-path',
    `/org/pixelrpg/maker/${label}/control`,
    '--method',
    `org.pixelrpg.maker.Control.${method}`,
    ...rest,
  ])

/**
 * Parse `gdbus`'s GVariant reply into the status object.
 *
 * gdbus prints the payload single-quoted, and switches to DOUBLE quotes
 * with backslash-escaped inner quotes as soon as it contains an
 * apostrophe — `games/zelda-like` has "Link's Tree House", so both forms
 * show up in one session. Grepping the raw text therefore silently stops
 * matching halfway through a run; unwrap it properly instead.
 */
function parseStatus(stdout) {
  const text = stdout.trim()
  if (!text.startsWith('(')) return null
  const inner = text.slice(1, text.lastIndexOf(',)') >= 0 ? text.lastIndexOf(',)') : text.length - 1).trim()
  const quote = inner[0]
  if (quote !== "'" && quote !== '"') return null
  const body = inner.slice(1, -1)
  const json = quote === '"' ? body.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : body
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

async function status(label) {
  const { code, stdout } = await control(label, 'GetStatus')
  return code === 0 ? parseStatus(stdout) : null
}

/**
 * Activate `win.open-scene-by-id`.
 *
 * The value needs TWO layers of quoting: gdbus GVariant-unquotes each
 * argument before the app sees it, and the app then `JSON.parse`s what is
 * left. A single layer arrives as a bare word, `JSON.parse` throws inside
 * the D-Bus handler, and the action silently never runs — which looks
 * exactly like "the map failed to open".
 */
const openScene = (label, map) => control(label, 'ActivateAction', 'win', 'open-scene-by-id', `"\\"${map}\\""`)

async function waitFor(label, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await status(label)
    if (last && predicate(last)) return last
    await sleep(150)
  }
  return last
}

function verdict(st, wantMap) {
  if (!st) return 'no status from the Control interface'
  if (st.view !== 'scene-editor') return `view is "${st.view}", not the scene editor`
  if (!st.enginePresent) return 'no engine widget'
  if (!st.engineReady) return 'engine widget has no live Excalibur instance'
  if (st.currentSceneId !== wantMap) return `showing "${st.currentSceneId}", asked for "${wantMap}"`
  if (!st.activeLayer) return 'no active layer — the editor has no paint target'
  return null
}

async function once(index, logDir) {
  const label = `smoke${process.pid.toString(16)}x${index}`
  const logPath = join(logDir, `run-${index}.log`)
  const logFile = createWriteStream(logPath)
  const child = spawn(BIN, [], {
    env: { ...process.env, PIXELRPG_INSTANCE: label },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout.pipe(logFile)
  child.stderr.pipe(logFile)

  try {
    if (!(await waitFor(label, () => true, TIMEOUT_MS))) {
      return { ok: false, why: child.exitCode !== null ? 'the app exited during start-up' : 'no D-Bus name', logPath }
    }

    await control(label, 'OpenProject', PROJECT)
    const adopted = await waitFor(label, (s) => (s.sceneIds ?? []).includes(MAP_ID), TIMEOUT_MS)
    if (!adopted) return { ok: false, why: `project never adopted "${MAP_ID}"`, logPath }

    await openScene(label, MAP_ID)

    // Second open at the moment the engine reports itself live. That is
    // the window a project load is still running in, and the one two map
    // opens used to collide in — an impatient click on a second atlas
    // card. Skip it with `--second-map ''` for a plain single open.
    let wantMap = MAP_ID
    if (SECOND_MAP_ID) {
      await waitFor(label, (s) => s.engineReady === true, TIMEOUT_MS)
      await openScene(label, SECOND_MAP_ID)
      wantMap = SECOND_MAP_ID
    }

    const settled = await waitFor(label, (s) => verdict(s, wantMap) === null, TIMEOUT_MS)
    const why = verdict(settled, wantMap)
    return { ok: why === null, why, logPath }
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
    await sleep(500)
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
    // AWAIT the flush. Ending the stream without waiting left the caller
    // reading a file the pipe had not written yet, so a failing run
    // printed an empty app log — the one artifact that says what went
    // wrong.
    await new Promise((resolve) => logFile.end(resolve))
  }
}

const logDir = await mkdtemp(join(tmpdir(), 'pixelrpg-smoke-'))
let failures = 0
for (let i = 1; i <= RUNS; i++) {
  const { ok, why, logPath } = await once(i, logDir)
  if (ok) {
    console.log(`run ${i}/${RUNS}: ok`)
    continue
  }
  failures += 1
  console.error(`run ${i}/${RUNS}: FAILED — ${why}`)
  // The app log is the only thing that says WHICH branch of the load
  // path ran, and in CI nobody can reproduce it by hand afterwards.
  const log = await readFile(logPath, 'utf8').catch(() => '')
  const tail = log.split('\n').slice(-40).join('\n')
  console.error(`--- last 40 lines of the app log ---\n${tail}\n---`)
}

await rm(logDir, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\n✖ open-a-map smoke check: ${failures}/${RUNS} runs failed`)
  process.exit(1)
}
console.log(`\n✓ open-a-map smoke check: ${RUNS}/${RUNS} runs opened a map and could edit it`)
