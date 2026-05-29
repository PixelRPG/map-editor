import { run } from '@gjsify/unit'

import roomManagerSuite from './room-manager.spec.js'
import serverE2eSuite from './server.e2e.spec.js'

run({ roomManagerSuite, serverE2eSuite })
