import { run } from '@gjsify/unit'

import collabSessionE2eSuite from './services/collab-session-e2e.spec.js'
import lanDiscoverySuite from './services/lan-discovery.spec.js'
import lanDiscoveryIntegrationSuite from './services/lan-discovery-integration.gjs.spec.js'
import lanDiscoveryParseSuite from './services/lan-discovery-parse.spec.js'
import lanSignallingIntegrationSuite from './services/lan-signalling-integration.spec.js'
import lanSignallingSuite from './services/lan-signalling.spec.js'
import orphanPublisherCleanupSuite from './services/orphan-publisher-cleanup.spec.js'
import pixelrpgUrlSuite from './services/pixelrpg-url.spec.js'
import relaySignallingSuite from './services/relay-signalling.spec.js'
import sandboxPathSuite from './services/sandbox-path.spec.js'
import sessionServiceSuite from './services/session-service.spec.js'

run({
  collabSessionE2eSuite,
  lanDiscoverySuite,
  lanDiscoveryIntegrationSuite,
  lanDiscoveryParseSuite,
  lanSignallingIntegrationSuite,
  lanSignallingSuite,
  orphanPublisherCleanupSuite,
  pixelrpgUrlSuite,
  relaySignallingSuite,
  sandboxPathSuite,
  sessionServiceSuite,
})
