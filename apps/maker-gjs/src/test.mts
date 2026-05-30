import { run } from '@gjsify/unit'

import lanDiscoveryParseSuite from './services/lan-discovery-parse.spec.js'
import lanSignallingIntegrationSuite from './services/lan-signalling-integration.spec.js'
import lanSignallingSuite from './services/lan-signalling.spec.js'
import pixelrpgUrlSuite from './services/pixelrpg-url.spec.js'
import relaySignallingSuite from './services/relay-signalling.spec.js'
import sandboxPathSuite from './services/sandbox-path.spec.js'
import sessionServiceSuite from './services/session-service.spec.js'

run({
  lanDiscoveryParseSuite,
  lanSignallingIntegrationSuite,
  lanSignallingSuite,
  pixelrpgUrlSuite,
  relaySignallingSuite,
  sandboxPathSuite,
  sessionServiceSuite,
})
