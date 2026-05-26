// Browser build config. The excalibur fork embeds .glsl shaders and a .png
// bitmap font as source-level imports; esbuild needs a loader entry per
// extension. `process.env.__EX_VERSION` + `NODE_ENV` are read by the fork
// at bundle time, so bake them via `define`.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default {
  // Sticking with `esbuild` legacy key — see the corresponding
  // comment in `apps/maker-gjs/gjsify.config.js`. Naive rename to
  // `bundler` breaks `define` substitution (lives under
  // `transform.define` in RolldownOptions) and drops `loader`
  // entries. Migrate when gjsify 0.5.0 lands with concrete
  // migration notes.
  esbuild: {
    define: {
      'process.env.__EX_VERSION': JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    // `.css` is handled upstream by `@gjsify/esbuild-plugin-css` (since
    // @gjsify/cli v0.1.12) — no `.css` loader override needed here.
    loader: {
      '.glsl': 'text',
      '.png': 'dataurl',
    },
  },
}
