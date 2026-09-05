// NOTE: HAND-MAINTAINED — `gjsify test` runs only the suites imported +
// passed to `run()` here, not every `*.spec.ts` on disk (enforced by the
// root `check:specs` guard). Only GTK-free modules can be tested: the
// widget classes subclass `Gtk.Widget`, so a spec that imports one would
// pull `gi://Gtk` into the node test bundle and fail to load. Colocate
// pure logic in a GTK-free module (e.g. `map-preview.geometry.ts`) and
// test that.
import { run } from '@gjsify/unit'

import signalScopeSuite from './utils/signal-scope.spec.js'
import addAnimationDialogModelSuite from './widgets/cast/add-animation-dialog.model.spec.js'
import animationSequenceSuite from './widgets/cast/animation-sequence.spec.js'
import animationTimelineGeometrySuite from './widgets/cast/animation-timeline.geometry.spec.js'
import characterAnimationSuite from './widgets/cast/character-animation.spec.js'
import spriteSetImportModelSuite from './widgets/cast/sprite-set-import.model.spec.js'
import atlasCanvasGeometrySuite from './widgets/editor/atlas-canvas.geometry.spec.js'
import atlasOverviewGeometrySuite from './widgets/editor/atlas-overview.geometry.spec.js'
import bakeCacheSuite from './widgets/editor/bake-cache.spec.js'
import depthGlyphGeometrySuite from './widgets/editor/depth-glyph.geometry.spec.js'
import depthGlyphProbeSuite from './widgets/editor/depth-glyph.probe.spec.js'
import eventActionModelSuite from './widgets/editor/event-action-model.spec.js'
import layerSectionsSuite from './widgets/editor/layer-sections.spec.js'
import mapPreviewGeometrySuite from './widgets/editor/map-preview.geometry.spec.js'
import mapPreviewOpsSuite from './widgets/editor/map-preview.ops.spec.js'
import sceneCardDragSuite from './widgets/editor/scene-card.drag.spec.js'
import sceneInspectorModelSuite from './widgets/editor/scene-inspector.model.spec.js'
import teleportOverlayGeometrySuite from './widgets/editor/teleport-overlay.geometry.spec.js'
import tilePaletteGeometrySuite from './widgets/editor/tile-palette.geometry.spec.js'

run({
  addAnimationDialogModelSuite,
  animationSequenceSuite,
  animationTimelineGeometrySuite,
  atlasCanvasGeometrySuite,
  atlasOverviewGeometrySuite,
  bakeCacheSuite,
  characterAnimationSuite,
  depthGlyphGeometrySuite,
  depthGlyphProbeSuite,
  eventActionModelSuite,
  layerSectionsSuite,
  mapPreviewGeometrySuite,
  mapPreviewOpsSuite,
  sceneCardDragSuite,
  sceneInspectorModelSuite,
  signalScopeSuite,
  spriteSetImportModelSuite,
  teleportOverlayGeometrySuite,
  tilePaletteGeometrySuite,
})
