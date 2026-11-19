import { gettextPlugin, xgettextPlugin } from '@gjsify/vite-plugin-gettext'
import { readFileSync } from 'node:fs'

// The text domain is the app id: `bindtextdomain` in apps/maker-gjs/src/main.ts and the
// installed `<lang>/LC_MESSAGES/<domain>.mo` must spell it identically, or every lookup
// silently falls back to English.
const APPLICATION_ID = 'org.pixelrpg.maker'
const VERSION = JSON.parse(readFileSync('../../apps/maker-gjs/package.json', 'utf8')).version

// One domain for the whole repo: the app and the widget package are layers of one binary,
// and a second domain would be a second catalogue to bind for strings a user cannot tell apart.
const xgettext = xgettextPlugin({
  sources: [
    '../../apps/maker-gjs/src/**/*.{ts,blp}',
    '../../apps/maker-gjs/data/**/*.{desktop.in,xml.in}',
    '../gjs/src/**/*.{ts,blp}',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.blp.ts',
  ],
  output: `./${APPLICATION_ID}.pot`,
  domain: APPLICATION_ID,
  preset: 'glib',
  verbose: true,
  version: VERSION,
  autoUpdatePo: true,
  msgidBugsAddress: 'https://github.com/PixelRPG/map-editor/issues',
  // Stable, mergeable output: no line numbers, sorted, never rewrapped.
  noLocation: true,
  sortOutput: true,
  preserveCreationDate: true,
  noWrap: true,
})

const gettext = gettextPlugin({
  poDirectory: '.',
  moDirectory: './dist',
  filename: `${APPLICATION_ID}.mo`,
  verbose: true,
})

await xgettext.buildStart()
await gettext.buildStart()

// Under GJS the plugins' Gio.Subprocess calls leave the main loop armed, so a one-shot
// generator would never exit on its own.
globalThis.process?.exit?.(0)
