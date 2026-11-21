// MUST stay the first import — read the module's comment.
import '@pixelrpg/engine/node-test-globals'
import { run } from '@gjsify/unit'
import accelsSuite from './actions/accels.spec.js'
import actionRegistrySuite from './actions/action-registry.spec.js'
import windowActionsSuite from './actions/window-actions.gjs.spec.js'
import instanceIdSuite from './instance-id.spec.js'
import assistantPausePolicySuite from './services/assistant-pause-policy.spec.js'
import atlasCameraStoreSuite from './services/atlas-camera-store.spec.js'
import assistantStateServiceSuite from './services/assistant-state.service.spec.js'
import backOrderSuite from './services/back-order.spec.js'
import brushKeysSuite from './services/brush-keys.spec.js'
import collabIdentitySuite from './services/collab-identity.spec.js'
import collabLogSuite from './services/collab-log.spec.js'
import collabSessionSuite from './services/collab-session.spec.js'
import collabSessionE2eSuite from './services/collab-session-e2e.spec.js'
import engineControllerSuite from './services/engine-controller.spec.js'
import serialQueueSuite from './services/serial-queue.spec.js'
import sceneNavigatorSuite from './services/scene-navigator.spec.js'
import engineStateSyncSuite from './services/engine-state-sync.spec.js'
import gameCheckupModelSuite from './services/game-checkup.model.spec.js'
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
import peerPlacesSuite from './services/peer-places.spec.js'
import pixelrpgUrlSuite from './services/pixelrpg-url.spec.js'
import togetherModelSuite from './services/together-model.spec.js'
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
import connectionIndicatorSuite from './services/connection-indicator.spec.js'
import collabInboundRouteSuite from './services/collab-inbound-route.spec.js'
import collabOpStamperSuite from './services/collab-op-stamper.spec.js'
import collabPeerColourSuite from './services/collab-peer-colour.spec.js'
import collabPeerConnectSuite from './services/collab-peer-connect.spec.js'
import collabSinkBufferSuite from './services/collab-sink-buffer.spec.js'
import creditsEditSuite from './services/credits-edit.spec.js'
import entityDeletionSuite from './services/entity-deletion.spec.js'
import entityTemplatesSuite from './services/entity-templates.spec.js'
import entityVisualsSuite from './services/entity-visuals.spec.js'
import gameSectionSuite from './services/game-section.spec.js'
import layerDescriptorsSuite from './services/layer-descriptors.spec.js'
import layerDraftSuite from './services/layer-draft.spec.js'
import libraryChipSuite from './services/library-chip.spec.js'
import newThingDraftSuite from './services/new-thing-draft.spec.js'
import projectStoreBroadcastSuite from './services/project-store-broadcast.spec.js'
import projectStoreEntitiesSuite from './services/project-store-entities.spec.js'
import projectStoreMapsSuite from './services/project-store-maps.spec.js'
import projectStorePersistenceSuite from './services/project-store-persistence.spec.js'
import projectStoreSpriteSetsSuite from './services/project-store-sprite-sets.spec.js'
import sessionDiscoveryIndexSuite from './services/session-discovery-index.spec.js'
import sessionOpenFlowSuite from './services/session-open-flow.spec.js'
import sessionStateSuite from './services/session-state.spec.js'
import tilesViewModelSuite from './services/tiles-view-model.spec.js'
import viewModeMapSuite from './services/view-mode-map.spec.js'
import welcomeModelSuite from './services/welcome-model.spec.js'

run({
  connectionIndicatorSuite,
  accelsSuite,
  actionRegistrySuite,
  assistantPausePolicySuite,
  assistantStateServiceSuite,
  atlasCameraStoreSuite,
  backOrderSuite,
  brushKeysSuite,
  castControllerAnimationsSuite,
  castControllerPreviewCacheSuite,
  castControllerViewModelSuite,
  castViewModelSuite,
  collabIdentitySuite,
  collabInboundRouteSuite,
  collabLogSuite,
  collabOpStamperSuite,
  collabPeerColourSuite,
  collabPeerConnectSuite,
  collabSessionE2eSuite,
  collabSessionSuite,
  collabSinkBufferSuite,
  creditsEditSuite,
  engineControllerSuite,
  serialQueueSuite,
  sceneNavigatorSuite,
  engineStateSyncSuite,
  entityDeletionSuite,
  entityTemplatesSuite,
  entityVisualsSuite,
  gameCheckupModelSuite,
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
  gameSectionSuite,
  libraryChipSuite,
  mapEditorDataSuite,
  newThingDraftSuite,
  orphanPublisherCleanupSuite,
  participantRosterSuite,
  peerPlacesSuite,
  pixelrpgUrlSuite,
  projectLoaderSuite,
  projectStoreBroadcastSuite,
  projectStoreEntitiesSuite,
  projectStoreMapsSuite,
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
  togetherModelSuite,
  uiTierSuite,
  viewModeMapSuite,
  welcomeModelSuite,
  windowActionsSuite,
  zoomMathSuite,
})
