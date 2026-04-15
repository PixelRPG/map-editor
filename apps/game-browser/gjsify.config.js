// Browser build config. The excalibur fork embeds .glsl shaders and a .png
// bitmap font as source-level imports; esbuild needs a loader entry per
// extension. `process.env.__EX_VERSION` + `NODE_ENV` are read by the fork
// at bundle time, so bake them via `define`.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default {
  esbuild: {
    define: {
      'process.env.__EX_VERSION': JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    loader: {
      '.glsl': 'text',
      '.png': 'dataurl',
      '.css': 'text',
    },
  },
}
