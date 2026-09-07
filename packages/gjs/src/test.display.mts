// NOTE: HAND-MAINTAINED, like `test.mts` — and GJS-ONLY. The suites here
// build real widgets and read them back through a display, so they run
// on a workstation and, in CI, under `gtk4-broadwayd`; headless they skip
// (counted as ignored, never as passed). They cannot share `test.mts`:
// even behind a lazy `import()` the widget graph's `gettext` and `gi://`
// externals are hoisted to the top of the single-file node bundle, and
// Node fails at load for code it would never run. The package's `test`
// script runs this entry with `--runtime gjs` after the GTK-free one, and
// the root `check:specs` guard accepts a spec registered in either.
import { run } from '@gjsify/unit'

import brushBadgeProbeSuite from './widgets/editor/brush-badge.probe.spec.js'
import depthGlyphProbeSuite from './widgets/editor/depth-glyph.probe.spec.js'
import phoneChromeProbeSuite from './widgets/editor/phone-chrome.probe.spec.js'

run({
  brushBadgeProbeSuite,
  depthGlyphProbeSuite,
  phoneChromeProbeSuite,
})
