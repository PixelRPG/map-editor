// Polyfill `globalThis.window` BEFORE excalibur is imported anywhere
// in the suite tree — its `polyfill()` runs at module init and
// throws under Node otherwise.
const winTarget = globalThis as { window?: unknown }
if (typeof winTarget.window === 'undefined') {
  winTarget.window = globalThis
}

import { run } from '@gjsify/unit'

// NOTE: this entry is HAND-MAINTAINED — `gjsify test` runs only the
// suites imported + passed to `run()` below, NOT every `*.spec.ts` on
// disk. A new spec that isn't added here silently never runs (and CI
// stays green while testing nothing). When you add a `*.spec.ts`, add
// its import + `run()` entry here. (Tracked in TODO.md as a guard
// follow-up — a test that asserts every spec file is registered.)
import editOperationsSuite from './engine/edit-operations.spec.js'
import layerFlagCommandSuite from './commands/layer-flag.command.spec.js'
import layerLifecycleCommandSuite from './commands/layer-lifecycle.command.spec.js'
import layerOrderCommandSuite from './commands/layer-order.command.spec.js'
import objectPlacementCommandSuite from './commands/object-placement.command.spec.js'
import paintTileCommandSuite from './commands/paint-tile.command.spec.js'
import registrySuite from './commands/registry.spec.js'
import tilemapPlaneSuite from './components/tilemap-plane.spec.js'
import actionsSpecSuite from './entity/specs/actions.spec.js'
import entityConvertSuite from './entity/convert.spec.js'
import entityDataAccessSuite from './entity/data-access.spec.js'
import entityDisclosureSuite from './entity/disclosure.spec.js'
import entityPlacementGraphicSuite from './entity/placement-graphic.spec.js'
import entityRegistrySuite from './entity/registry.spec.js'
import entitySpawnPlacementSuite from './entity/spawn-placement.spec.js'
import entityValidateSuite from './entity/validate.spec.js'
import objectSystemValidationSuite from './format/object-system-validation.spec.js'
import gameSystemsRegistrySuite from './game-systems/registry.spec.js'
import boundsDerivationSuite from './resource/bounds-derivation.spec.js'
import mapResourceSuite from './resource/map-resource.spec.js'
import shadowFoldSuite from './resource/shadow-fold.spec.js'
import spriteSoliditySuite from './resource/sprite-solidity.spec.js'
import agentMapDataSuite from './services/agent-map-data.spec.js'
import assistantPresenceSuite from './services/assistant-presence.spec.js'
import editorViewFlagsSuite from './services/editor-view-flags.spec.js'
import floodFillSuite from './services/flood-fill.spec.js'
import layerFlagEventSuite from './services/layer-flag-event.spec.js'
import layerOrderSuite from './services/layer-order.spec.js'
import layerVisibilitySuite from './services/layer-visibility.spec.js'
import placementGeometrySuite from './services/placement-geometry.spec.js'
import placementPickingSuite from './services/placement-picking.spec.js'
import placementIdSuite from './services/placement-id.spec.js'
import playerCharacterSuite from './services/player-character.spec.js'
import regionGeometrySuite from './services/region-geometry.spec.js'
import spriteValidatorSuite from './services/sprite.validator.spec.js'
import spriteInfoResolverSuite from './services/sprite-info.resolver.spec.js'
import tileEditTargetSuite from './services/tile-edit-target.spec.js'
import tileGeometrySuite from './services/tile-geometry.spec.js'
import awarenessSuite from './sync/awareness.spec.js'
import chunkingSuite from './sync/chunking.spec.js'
import collabIntegrationSuite from './sync/collab-integration.spec.js'
import cursorThrottleSuite from './sync/cursor-throttle.spec.js'
import disconnectGraceSuite from './sync/disconnect-grace.spec.js'
import inMemoryTransportSuite from './sync/in-memory-transport.spec.js'
import opCategorySuite from './sync/op-category.spec.js'
import peerSessionSuite from './sync/peer-session.spec.js'
import pendingIceBufferSuite from './sync/pending-ice-buffer.spec.js'
import preAttachOpBufferSuite from './sync/pre-attach-op-buffer.spec.js'
import projectOperationsSuite from './sync/project-operations.spec.js'
import projectSnapshotSuite from './sync/project-snapshot.spec.js'
import sessionControllerSuite from './sync/session-controller.spec.js'
import sessionProtocolSuite from './sync/session-protocol.spec.js'
import snapshotExchangeSuite from './sync/snapshot-exchange.spec.js'
import snapshotPathsSuite from './sync/snapshot-paths.spec.js'
import combatActionSuite from './systems/combat-action.spec.js'
import eventActionSystemSuite from './systems/event-action.system.spec.js'
import hoverOverlaysSuite from './systems/hover-overlays.spec.js'
import inputSystemSuite from './systems/input.system.spec.js'
import stateSystemSuite from './systems/state.system.spec.js'
import statsSystemSuite from './systems/stats.system.spec.js'
import tileEditorSystemSuite from './systems/tile-editor.system.spec.js'
import walkOnTileSuite from './systems/walk-on-tile.system.spec.js'
import objectSystemSuite from './types/data/object-system.spec.js'
import spriteSetUtilsSuite from './utils/sprite-set.utils.spec.js'
import subscriptionRegistrySuite from './utils/subscription-registry.spec.js'

run({
  registrySuite,
  editOperationsSuite,
  paintTileCommandSuite,
  layerFlagCommandSuite,
  layerLifecycleCommandSuite,
  layerOrderCommandSuite,
  tilemapPlaneSuite,
  objectPlacementCommandSuite,
  entityRegistrySuite,
  gameSystemsRegistrySuite,
  actionsSpecSuite,
  entityValidateSuite,
  entityConvertSuite,
  entityDataAccessSuite,
  entityDisclosureSuite,
  entityPlacementGraphicSuite,
  entitySpawnPlacementSuite,
  objectSystemValidationSuite,
  mapResourceSuite,
  boundsDerivationSuite,
  shadowFoldSuite,
  spriteSoliditySuite,
  layerVisibilitySuite,
  placementGeometrySuite,
  placementIdSuite,
  placementPickingSuite,
  playerCharacterSuite,
  regionGeometrySuite,
  spriteInfoResolverSuite,
  spriteValidatorSuite,
  tileEditTargetSuite,
  tileGeometrySuite,
  editorViewFlagsSuite,
  agentMapDataSuite,
  assistantPresenceSuite,
  floodFillSuite,
  layerFlagEventSuite,
  layerOrderSuite,
  awarenessSuite,
  chunkingSuite,
  collabIntegrationSuite,
  cursorThrottleSuite,
  disconnectGraceSuite,
  inMemoryTransportSuite,
  opCategorySuite,
  peerSessionSuite,
  pendingIceBufferSuite,
  preAttachOpBufferSuite,
  projectOperationsSuite,
  projectSnapshotSuite,
  sessionControllerSuite,
  sessionProtocolSuite,
  snapshotExchangeSuite,
  snapshotPathsSuite,
  inputSystemSuite,
  eventActionSystemSuite,
  hoverOverlaysSuite,
  stateSystemSuite,
  statsSystemSuite,
  combatActionSuite,
  tileEditorSystemSuite,
  walkOnTileSuite,
  objectSystemSuite,
  spriteSetUtilsSuite,
  subscriptionRegistrySuite,
})
