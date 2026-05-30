// Polyfill `globalThis.window` BEFORE excalibur is imported anywhere
// in the suite tree — its `polyfill()` runs at module init and
// throws under Node otherwise.
const winTarget = globalThis as { window?: unknown }
if (typeof winTarget.window === 'undefined') {
  winTarget.window = globalThis
}

import { run } from '@gjsify/unit'

import registrySuite from './commands/registry.spec.js'
import objectSystemValidationSuite from './format/object-system-validation.spec.js'
import layerVisibilitySuite from './services/layer-visibility.spec.js'
import spriteInfoResolverSuite from './services/sprite-info.resolver.spec.js'
import spriteValidatorSuite from './services/sprite.validator.spec.js'
import awarenessSuite from './sync/awareness.spec.js'
import peerSessionSuite from './sync/peer-session.spec.js'
import projectSnapshotSuite from './sync/project-snapshot.spec.js'
import sessionControllerSuite from './sync/session-controller.spec.js'
import objectSystemSuite from './types/data/object-system.spec.js'
import spriteSetUtilsSuite from './utils/sprite-set.utils.spec.js'
import subscriptionRegistrySuite from './utils/subscription-registry.spec.js'

run({
  registrySuite,
  objectSystemValidationSuite,
  layerVisibilitySuite,
  spriteInfoResolverSuite,
  spriteValidatorSuite,
  awarenessSuite,
  peerSessionSuite,
  projectSnapshotSuite,
  sessionControllerSuite,
  objectSystemSuite,
  spriteSetUtilsSuite,
  subscriptionRegistrySuite,
})
