#!/usr/bin/env node
// Two widget-lifecycle invariants that a type-check cannot see and a
// unit test cannot reach (the widgets subclass Gtk.Widget and can't be
// instantiated headlessly). Both encode a defect that actually shipped
// in this package, so both FAIL the build rather than warn.
//
//   1. notify-only setter — a GObject property setter whose whole body
//      is "store + notify" only works when something else reacts to the
//      notify. In this package that something is the Blueprint template
//      (`bind template.<prop>`). Without a binding the value is read
//      once in a build path, and setting the property afterwards is a
//      silent no-op: `CardGallery.reorderable` / `open-label` /
//      `rename-label` / `delete-tooltip` were exactly that.
//
//   2. self-disconnecting handler — `const id = src.connect(sig, () =>
//      { src.disconnect(id) … })` releases the handler only when the
//      signal arrives. When it never does (widget destroyed before the
//      first allocation, engine that never reaches `ready`) the handler
//      leaks, and calling the same method twice stacks another one:
//      `AtlasCanvas.fitToContent()` was exactly that. `SignalScope`
//      owns this shape now — see its `connectUntil`.
//
// Both rules take a deliberate-exception annotation so a real violation
// stays distinguishable from a considered decision:
//   `// notify-only: <reason>`         above the setter
//   `// deferred-disconnect: <reason>` above the connect
//
// Run from the package root: `node scripts/check-widget-invariants.mjs`
// (wired into this package's `check` script, so CI's type-check step
// gates it).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

/** Every `.ts` file under `src/`, excluding specs and stories. */
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.story.ts')) {
      out.push(path)
    }
  }
  return out.sort()
}

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** Comment lines directly above `index`, nearest first. */
function commentBlockAbove(lines, index) {
  const block = []
  for (let i = index - 1; i >= 0; i--) {
    const text = lines[i].trim()
    if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*') || text.startsWith('*/')) {
      block.push(text)
      continue
    }
    break
  }
  return block.join('\n')
}

/** Line index where the block opened on `start` closes, or `lines.length`. */
function blockEnd(lines, start) {
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '(') depth++
      else if (ch === '}' || ch === ')') depth--
    }
    if (i > start || depth <= 0) {
      if (depth <= 0) return i
    }
  }
  return lines.length - 1
}

const violations = []
const exempted = { templateBound: 0, annotated: 0 }

for (const file of sourceFiles(SRC)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const blp = file.replace(/\.ts$/, '.blp')
  const template = existsSync(blp) ? readFileSync(blp, 'utf8') : ''
  const relative = file.slice(SRC.length - 3)

  for (let i = 0; i < lines.length; i++) {
    // ---- rule 1: notify-only setter ------------------------------
    const setter = /^(\s*)set\s+([A-Za-z0-9_]+)\s*\(/.exec(lines[i])
    if (setter) {
      const indent = setter[1]
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === `${indent}}`) break
        body.push(lines[j])
      }
      const notifies = body.some((line) => /this\.notify\(/.test(line))
      const effect = body.filter((line) => {
        const text = line.trim()
        if (!text || text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return false
        if (/^if \(this\._\w+ === value\) return$/.test(text)) return false
        if (/^this\._\w+ = value$/.test(text)) return false
        if (/^this\.notify\(/.test(text)) return false
        return true
      })
      if (notifies && effect.length === 0) {
        const property = kebab(setter[2])
        if (new RegExp(`bind\\s+template\\.${property}\\b`).test(template)) exempted.templateBound++
        else if (/notify-only:/.test(commentBlockAbove(lines, i))) exempted.annotated++
        else {
          violations.push(
            `${relative}:${i + 1}  set ${setter[2]} stores + notifies and nothing else, but ` +
              `'${property}' is not bound in ${existsSync(blp) ? `${relative.replace(/\.ts$/, '.blp')} ` : 'any template '}` +
              `— setting it after the build path that reads it is a silent no-op. ` +
              `Re-apply it to the built children, or annotate with '// notify-only: <reason>'.`,
          )
        }
      }
    }

    // ---- rule 2: self-disconnecting handler ----------------------
    const connect = /(?:const|let)?\s*([A-Za-z0-9_]+)\s*=\s*[A-Za-z0-9_.[\]()]+\.connect(?:_after)?\(/.exec(lines[i])
    if (!connect) continue
    const handler = connect[1]
    if (handler === 'this' || (/^_/.test(handler) === false && !/id$/i.test(handler))) continue
    const releases = []
    for (let j = 0; j < lines.length; j++) {
      if (new RegExp(`\\.disconnect\\(\\s*(this\\.)?${handler}\\s*\\)`).test(lines[j])) releases.push(j)
    }
    const end = blockEnd(lines, i)
    const outside = releases.filter((line) => line < i || line > end)
    if (outside.length > 0) continue
    if (/deferred-disconnect:/.test(commentBlockAbove(lines, i))) {
      exempted.annotated++
      continue
    }
    violations.push(
      `${relative}:${i + 1}  '${handler}' is disconnected only from inside its own handler ` +
        `— nothing releases it if the signal never arrives, and a second call stacks another. ` +
        `Use SignalScope.connectUntil, or annotate with '// deferred-disconnect: <reason>'.`,
    )
  }

  // ---- rule 3: a SignalScope must be released --------------------
  if (/new SignalScope\(\)/.test(source) && !/\.disconnectAll\(\)/.test(source)) {
    violations.push(
      `${relative}  declares a SignalScope but never calls disconnectAll() — connect in vfunc_map, release in vfunc_unmap.`,
    )
  }
}

const exemptTotal = exempted.templateBound + exempted.annotated
if (violations.length === 0) {
  console.log(
    `widget invariants OK (${exempted.templateBound} template-bound + ${exempted.annotated} annotated exceptions, ${exemptTotal} total)`,
  )
  process.exit(0)
}

console.error(`widget invariants: ${violations.length} violation(s)\n`)
for (const violation of violations) console.error(`  ${violation}`)
process.exit(1)
