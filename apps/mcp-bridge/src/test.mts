// NOTE: HAND-MAINTAINED — `gjsify test` runs only the suites imported +
// passed to `run()` here, not every `*.spec.ts` on disk (enforced by the
// root `check:specs` guard). The bridge proper opens a live session bus at
// module load, so only its dependency-free modules can run under the node
// target — the instance-label → D-Bus address routing, the D-Bus error
// wording every tool answers with, and the window-size resolution.
import { run } from '@gjsify/unit'

import dbusErrorSuite from './dbus/dbus-error.spec.js'
import instanceRoutingSuite from './instance-routing.spec.js'
import windowSizeSuite from './tools/window-size.spec.js'

run({ instanceRoutingSuite, dbusErrorSuite, windowSizeSuite })
