import { run } from '@gjsify/unit'

import lanDiscoveryParseSuite from './services/lan-discovery-parse.spec.js'
import lanSignallingSuite from './services/lan-signalling.spec.js'

run({ lanDiscoveryParseSuite, lanSignallingSuite })
