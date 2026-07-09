// Browser build config. The Excalibur fork embeds .glsl shaders and a .png
// bitmap font as source-level imports → one loader entry per extension.
// `process.env.__EX_VERSION` + `NODE_ENV` are read by the fork at bundle
// time, so bake them via define.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default {
  // gjsify 0.16 schema (migrated off the removed `esbuild` legacy key):
  // compile-time constants live under `bundler.transform.define`; asset
  // loaders are the top-level `loaders` map (replaces `esbuild.loader`).
  // `.css` is handled automatically by the css-as-string plugin.
  bundler: {
    transform: {
      define: {
        'process.env.__EX_VERSION': JSON.stringify(pkg.version),
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    },
  },
  loaders: {
    '.glsl': 'text',
    '.png': 'dataurl',
  },
}
