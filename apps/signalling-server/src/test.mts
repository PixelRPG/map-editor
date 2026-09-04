import { run } from '@gjsify/unit'

import requestRoutingSuite from './request-routing.spec.js'
import roomManagerSuite from './room-manager.spec.js'
import serverE2eSuite from './server.e2e.spec.js'

run({ roomManagerSuite, requestRoutingSuite, serverE2eSuite })
