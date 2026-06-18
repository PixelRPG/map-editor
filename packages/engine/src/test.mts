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
import layerFlagCommandSuite from './commands/layer-flag.command.spec.js'
import objectPlacementCommandSuite from './commands/object-placement.command.spec.js'
import paintTileCommandSuite from './commands/paint-tile.command.spec.js'
import registrySuite from './commands/registry.spec.js'
import entityConvertSuite from './entity/convert.spec.js'
import entityDataAccessSuite from './entity/data-access.spec.js'
import entityPlacementGraphicSuite from './entity/placement-graphic.spec.js'
import entityRegistrySuite from './entity/registry.spec.js'
import entitySpawnPlacementSuite from './entity/spawn-placement.spec.js'
import entityValidateSuite from './entity/validate.spec.js'
import objectSystemValidationSuite from './format/object-system-validation.spec.js'
import mapResourceSuite from './resource/map-resource.spec.js'
import agentMapDataSuite from './services/agent-map-data.spec.js'
import assistantPresenceSuite from './services/assistant-presence.spec.js'
import layerVisibilitySuite from './services/layer-visibility.spec.js'
import placementIdSuite from './services/placement-id.spec.js'
import spriteValidatorSuite from './services/sprite.validator.spec.js'
import spriteInfoResolverSuite from './services/sprite-info.resolver.spec.js'
import tileGeometrySuite from './services/tile-geometry.spec.js'
import awarenessSuite from './sync/awareness.spec.js'
import chunkingSuite from './sync/chunking.spec.js'
import collabIntegrationSuite from './sync/collab-integration.spec.js'
import inMemoryTransportSuite from './sync/in-memory-transport.spec.js'
import peerSessionSuite from './sync/peer-session.spec.js'
import preAttachOpBufferSuite from './sync/pre-attach-op-buffer.spec.js'
import projectOperationsSuite from './sync/project-operations.spec.js'
import projectSnapshotSuite from './sync/project-snapshot.spec.js'
import sessionControllerSuite from './sync/session-controller.spec.js'
import sessionProtocolSuite from './sync/session-protocol.spec.js'
import snapshotExchangeSuite from './sync/snapshot-exchange.spec.js'
import inputSystemSuite from './systems/input.system.spec.js'
import tileEditorSystemSuite from './systems/tile-editor.system.spec.js'
import walkOnTileSuite from './systems/walk-on-tile.system.spec.js'
import objectSystemSuite from './types/data/object-system.spec.js'
import spriteSetUtilsSuite from './utils/sprite-set.utils.spec.js'
import subscriptionRegistrySuite from './utils/subscription-registry.spec.js'

run({
  registrySuite,
  paintTileCommandSuite,
  layerFlagCommandSuite,
  objectPlacementCommandSuite,
  entityRegistrySuite,
  entityValidateSuite,
  entityConvertSuite,
  entityDataAccessSuite,
  entityPlacementGraphicSuite,
  entitySpawnPlacementSuite,
  objectSystemValidationSuite,
  mapResourceSuite,
  layerVisibilitySuite,
  placementIdSuite,
  spriteInfoResolverSuite,
  spriteValidatorSuite,
  tileGeometrySuite,
  agentMapDataSuite,
  assistantPresenceSuite,
  awarenessSuite,
  chunkingSuite,
  collabIntegrationSuite,
  inMemoryTransportSuite,
  peerSessionSuite,
  preAttachOpBufferSuite,
  projectOperationsSuite,
  projectSnapshotSuite,
  sessionControllerSuite,
  sessionProtocolSuite,
  snapshotExchangeSuite,
  inputSystemSuite,
  tileEditorSystemSuite,
  walkOnTileSuite,
  objectSystemSuite,
  spriteSetUtilsSuite,
  subscriptionRegistrySuite,
})
