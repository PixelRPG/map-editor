// gjsify CLI config — replaces the old Vite `define` block.
// Values mirror what vite.config.js provided to the app at build time.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

const APPLICATION_ID = process.env.APPLICATION_ID || 'org.pixelrpg.maker'
const OUTDIR = process.env.OUTDIR || __dirname
const RESOURCES_PATH = `/${APPLICATION_ID.replaceAll('.', '/')}`
const PACKAGE_VERSION = process.env.PACKAGE_VERSION || pkg.version
const PREFIX = process.env.PREFIX || OUTDIR
const LIBDIR = process.env.LIBDIR || `${PREFIX}/lib`
const DATADIR = process.env.DATADIR || `${PREFIX}/data`
const BINDIR = process.env.BINDIR || PREFIX
const GJS_CONSOLE = process.env.GJS_CONSOLE || '/usr/bin/env -S gjs'
const PKGDATADIR = process.env.PKGDATADIR || DATADIR

export default {
  // gjsify 0.16 schema (migrated off the removed `esbuild` legacy key):
  // `define` under `bundler.transform.define` (the __X__ tokens are
  // substituted at build time and read at runtime), asset loaders as the
  // top-level `loaders` map (replaces `esbuild.loader`) — the .glsl/.png
  // loaders are what Excalibur's source-level shader/font imports need.
  // `.css` is handled automatically by the css-as-string plugin.
  bundler: {
    transform: {
      define: {
        __APPLICATION_ID__: JSON.stringify(APPLICATION_ID),
        __RESOURCES_PATH__: JSON.stringify(RESOURCES_PATH),
        __PACKAGE_VERSION__: JSON.stringify(PACKAGE_VERSION),
        __PREFIX__: JSON.stringify(PREFIX),
        __LIBDIR__: JSON.stringify(LIBDIR),
        __DATADIR__: JSON.stringify(DATADIR),
        __BINDIR__: JSON.stringify(BINDIR),
        __GJS_CONSOLE__: JSON.stringify(GJS_CONSOLE),
        __PKGDATADIR__: JSON.stringify(PKGDATADIR),
        // Excalibur fork reads these at bundle time; no Node process in GJS.
        'process.env.__EX_VERSION': JSON.stringify(PACKAGE_VERSION),
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    },
  },
  loaders: {
    '.glsl': 'text',
    '.png': 'dataurl',
  },
}
