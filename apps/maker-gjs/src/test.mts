import { run } from '@gjsify/unit'

import assistantPausePolicySuite from './services/assistant-pause-policy.spec.js'
import assistantStateServiceSuite from './services/assistant-state.service.spec.js'
import collabLogSuite from './services/collab-log.spec.js'
import collabSessionSuite from './services/collab-session.spec.js'
import collabSessionE2eSuite from './services/collab-session-e2e.spec.js'
import engineStateSyncSuite from './services/engine-state-sync.spec.js'
import lanDiscoverySuite from './services/lan-discovery.spec.js'
import lanDiscoveryIntegrationSuite from './services/lan-discovery-integration.gjs.spec.js'
import lanDiscoveryParseSuite from './services/lan-discovery-parse.spec.js'
import lanSignallingSuite from './services/lan-signalling.spec.js'
import lanSignallingIntegrationSuite from './services/lan-signalling-integration.spec.js'
import lanSignallingTimeoutSuite from './services/lan-signalling-timeout.spec.js'
import orphanPublisherCleanupSuite from './services/orphan-publisher-cleanup.spec.js'
import pixelrpgUrlSuite from './services/pixelrpg-url.spec.js'
import projectLoaderSuite from './services/project-loader.spec.js'
import projectStoreSuite from './services/project-store.spec.js'
import relaySignallingSuite from './services/relay-signalling.spec.js'
import sandboxPathSuite from './services/sandbox-path.spec.js'
import sessionServiceSuite from './services/session-service.spec.js'
import sessionServiceE2eSuite from './services/session-service-e2e.spec.js'

run({
  assistantPausePolicySuite,
  assistantStateServiceSuite,
  engineStateSyncSuite,
  collabLogSuite,
  collabSessionSuite,
  collabSessionE2eSuite,
  lanDiscoverySuite,
  lanDiscoveryIntegrationSuite,
  lanDiscoveryParseSuite,
  lanSignallingIntegrationSuite,
  lanSignallingSuite,
  lanSignallingTimeoutSuite,
  orphanPublisherCleanupSuite,
  pixelrpgUrlSuite,
  projectLoaderSuite,
  projectStoreSuite,
  relaySignallingSuite,
  sandboxPathSuite,
  sessionServiceSuite,
  sessionServiceE2eSuite,
})
