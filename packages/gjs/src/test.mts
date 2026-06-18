// NOTE: HAND-MAINTAINED — `gjsify test` runs only the suites imported +
// passed to `run()` here, not every `*.spec.ts` on disk (enforced by the
// root `check:specs` guard). Only GTK-free modules can be tested: the
// widget classes subclass `Gtk.Widget`, so a spec that imports one would
// pull `gi://Gtk` into the node test bundle and fail to load. Colocate
// pure logic in a GTK-free module (e.g. `map-preview.geometry.ts`) and
// test that.
import { run } from '@gjsify/unit'

import bakeCacheSuite from './widgets/editor/bake-cache.spec.js'
import mapPreviewGeometrySuite from './widgets/editor/map-preview.geometry.spec.js'

run({ bakeCacheSuite, mapPreviewGeometrySuite })
