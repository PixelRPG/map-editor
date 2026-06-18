// NOTE: HAND-MAINTAINED — `gjsify test` runs only the suites imported +
// passed to `run()` here, not every `*.spec.ts` on disk (enforced by the
// root `check:specs` guard). The bridge proper (`index.ts`) opens a live
// session bus at module load, so only its dependency-free helpers (the
// instance-label → D-Bus address routing) can run under the node target —
// colocate pure logic in a gi-free module and test that.
import { run } from '@gjsify/unit'

import instanceRoutingSuite from './instance-routing.spec.js'

run({ instanceRoutingSuite })
