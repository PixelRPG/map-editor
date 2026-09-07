import { run } from '@gjsify/unit'
import accelsSuite from './actions/accels.spec.js'
import actionRegistrySuite from './actions/action-registry.spec.js'
import windowActionsSuite from './actions/window-actions.gjs.spec.js'
import instanceIdSuite from './instance-id.spec.js'
import assistantPausePolicySuite from './services/assistant-pause-policy.spec.js'
import assistantStateServiceSuite from './services/assistant-state.service.spec.js'
import collabLogSuite from './services/collab-log.spec.js'
import collabSessionSuite from './services/collab-session.spec.js'
import collabSessionE2eSuite from './services/collab-session-e2e.spec.js'
import engineControllerSuite from './services/engine-controller.spec.js'
import engineStateSyncSuite from './services/engine-state-sync.spec.js'
import gameRulesModelSuite from './services/game-rules-model.spec.js'
import gvariantSuite from './services/gvariant.spec.js'
import lanDiscoverySuite from './services/lan-discovery.spec.js'
import lanDiscoveryIntegrationSuite from './services/lan-discovery-integration.gjs.spec.js'
import lanDiscoveryParseSuite from './services/lan-discovery-parse.spec.js'
import lanSignallingSuite from './services/lan-signalling.spec.js'
import lanSignallingIntegrationSuite from './services/lan-signalling-integration.spec.js'
import lanSignallingTimeoutSuite from './services/lan-signalling-timeout.spec.js'
import mapEditorDataSuite from './services/map-editor-data.spec.js'
import orphanPublisherCleanupSuite from './services/orphan-publisher-cleanup.spec.js'
import participantRosterSuite from './services/participant-roster.spec.js'
import pixelrpgUrlSuite from './services/pixelrpg-url.spec.js'
import projectLoaderSuite from './services/project-loader.spec.js'
import recentProjectsSuite from './services/recent-projects.spec.js'
import recentTimeSuite from './services/recent-time.spec.js'
import projectStoreSuite from './services/project-store.spec.js'
import relaySignallingSuite from './services/relay-signalling.spec.js'
import sandboxPathSuite from './services/sandbox-path.spec.js'
import sessionServiceSuite from './services/session-service.spec.js'
import sessionSnapshotSuite from './services/session-snapshot.spec.js'
import sessionServiceE2eSuite from './services/session-service-e2e.spec.js'
import themePreferenceSuite from './services/theme-preference.spec.js'
import uiTierSuite from './services/ui-tier.spec.js'
import thingCategoriesSuite from './services/thing-categories.spec.js'
import zoomMathSuite from './services/zoom-math.spec.js'

import castControllerAnimationsSuite from './services/cast-controller-animations.spec.js'
import castControllerPreviewCacheSuite from './services/cast-controller-preview-cache.spec.js'
import castControllerViewModelSuite from './services/cast-controller-view-model.spec.js'
import castViewModelSuite from './services/cast-view-model.spec.js'
import collabInboundRouteSuite from './services/collab-inbound-route.spec.js'
import collabOpStamperSuite from './services/collab-op-stamper.spec.js'
import collabPeerColourSuite from './services/collab-peer-colour.spec.js'
import collabPeerConnectSuite from './services/collab-peer-connect.spec.js'
import collabSinkBufferSuite from './services/collab-sink-buffer.spec.js'
import entityTemplatesSuite from './services/entity-templates.spec.js'
import entityVisualsSuite from './services/entity-visuals.spec.js'
import layerDescriptorsSuite from './services/layer-descriptors.spec.js'
import layerDraftSuite from './services/layer-draft.spec.js'
import libraryChipSuite from './services/library-chip.spec.js'
import projectStoreBroadcastSuite from './services/project-store-broadcast.spec.js'
import projectStoreEntitiesSuite from './services/project-store-entities.spec.js'
import projectStorePersistenceSuite from './services/project-store-persistence.spec.js'
import projectStoreSpriteSetsSuite from './services/project-store-sprite-sets.spec.js'
import sessionDiscoveryIndexSuite from './services/session-discovery-index.spec.js'
import sessionOpenFlowSuite from './services/session-open-flow.spec.js'
import sessionStateSuite from './services/session-state.spec.js'
import tilesViewModelSuite from './services/tiles-view-model.spec.js'
import viewModeMapSuite from './services/view-mode-map.spec.js'

run({
  accelsSuite,
  actionRegistrySuite,
  assistantPausePolicySuite,
  assistantStateServiceSuite,
  castControllerAnimationsSuite,
  castControllerPreviewCacheSuite,
  castControllerViewModelSuite,
  castViewModelSuite,
  collabInboundRouteSuite,
  collabLogSuite,
  collabOpStamperSuite,
  collabPeerColourSuite,
  collabPeerConnectSuite,
  collabSessionE2eSuite,
  collabSessionSuite,
  collabSinkBufferSuite,
  engineControllerSuite,
  engineStateSyncSuite,
  entityTemplatesSuite,
  entityVisualsSuite,
  gameRulesModelSuite,
  gvariantSuite,
  instanceIdSuite,
  lanDiscoveryIntegrationSuite,
  lanDiscoveryParseSuite,
  lanDiscoverySuite,
  lanSignallingIntegrationSuite,
  lanSignallingSuite,
  lanSignallingTimeoutSuite,
  layerDescriptorsSuite,
  layerDraftSuite,
  libraryChipSuite,
  mapEditorDataSuite,
  orphanPublisherCleanupSuite,
  participantRosterSuite,
  pixelrpgUrlSuite,
  projectLoaderSuite,
  projectStoreBroadcastSuite,
  projectStoreEntitiesSuite,
  projectStorePersistenceSuite,
  projectStoreSpriteSetsSuite,
  projectStoreSuite,
  recentProjectsSuite,
  recentTimeSuite,
  relaySignallingSuite,
  sandboxPathSuite,
  sessionDiscoveryIndexSuite,
  sessionOpenFlowSuite,
  sessionServiceE2eSuite,
  sessionServiceSuite,
  sessionSnapshotSuite,
  sessionStateSuite,
  themePreferenceSuite,
  thingCategoriesSuite,
  tilesViewModelSuite,
  uiTierSuite,
  viewModeMapSuite,
  windowActionsSuite,
  zoomMathSuite,
})
