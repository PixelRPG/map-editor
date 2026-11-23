// NOTE: HAND-MAINTAINED — `gjsify test` runs only the suites imported +
// passed to `run()` here, not every `*.spec.ts` on disk (enforced by the
// root `check:specs` guard). Only GTK-free modules can be tested HERE:
// the widget classes subclass `Gtk.Widget`, so a spec that imports one
// would pull `gi://Gtk` into the node test bundle and fail to load — and
// a lazily imported one still hoists its `gettext` / `gi://` externals
// to the top of the single-file node bundle. Colocate pure logic in a
// GTK-free module (e.g. `map-preview.geometry.ts`) and test it here; a
// suite that needs a real widget goes in `test.display.mts`, which only
// the GJS runtime runs.
// MUST stay the first import — read the module's comment.
import '@pixelrpg/engine/node-test-globals'
import { run } from '@gjsify/unit'

import placeholdersSuite from './utils/placeholders.spec.js'
import addAnimationDialogModelSuite from './widgets/cast/add-animation-dialog.model.spec.js'
import animationCellModelSuite from './widgets/cast/animation-cell.model.spec.js'
import animationSequenceSuite from './widgets/cast/animation-sequence.spec.js'
import animationTimelineGeometrySuite from './widgets/cast/animation-timeline.geometry.spec.js'
import characterAnimationSuite from './widgets/cast/character-animation.spec.js'
import spriteSetImportModelSuite from './widgets/cast/sprite-set-import.model.spec.js'
import atlasCameraSuite from './widgets/editor/atlas-camera.spec.js'
import atlasCanvasGeometrySuite from './widgets/editor/atlas-canvas.geometry.spec.js'
import atlasOverviewGeometrySuite from './widgets/editor/atlas-overview.geometry.spec.js'
import bakeCacheSuite from './widgets/editor/bake-cache.spec.js'
import bespokeEditorsModelSuite from './widgets/editor/bespoke-editors.model.spec.js'
import brushBadgeGeometrySuite from './widgets/editor/brush-badge.geometry.spec.js'
import chromeStagesSuite from './widgets/editor/chrome-stages.spec.js'
import componentInspectorModelSuite from './widgets/editor/component-inspector.model.spec.js'
import textLanguageModelSuite from './widgets/editor/text-language.model.spec.js'
import textListModelSuite from './widgets/editor/text-list.model.spec.js'
import depthGlyphGeometrySuite from './widgets/editor/depth-glyph.geometry.spec.js'
import doorTargetModelSuite from './widgets/editor/door-target.model.spec.js'
import entityComponentsEditorModelSuite from './widgets/editor/entity-components-editor.model.spec.js'
import conditionModelSuite from './widgets/editor/condition-model.spec.js'
import eventActionModelSuite from './widgets/editor/event-action-model.spec.js'
import flagPickerModelSuite from './widgets/editor/flag-picker.model.spec.js'
import layerSectionsSuite from './widgets/editor/layer-sections.spec.js'
import mapConnectionsModelSuite from './widgets/editor/map-connections.model.spec.js'
import mapPreviewGeometrySuite from './widgets/editor/map-preview.geometry.spec.js'
import mapPreviewOpsSuite from './widgets/editor/map-preview.ops.spec.js'
import mapSummaryModelSuite from './widgets/editor/map-summary.model.spec.js'
import recentTilesGeometrySuite from './widgets/editor/recent-tiles.geometry.spec.js'
import sceneCardDragSuite from './widgets/editor/scene-card.drag.spec.js'
import sheetDetentsSuite from './widgets/editor/sheet-detents.spec.js'
import sheetSlicersSuite from './widgets/editor/sheet-slicers.spec.js'
import teleportOverlayGeometrySuite from './widgets/editor/teleport-overlay.geometry.spec.js'
import terrainThumbnailGeometrySuite from './widgets/editor/terrain-thumbnail.geometry.spec.js'
import tilePaletteGeometrySuite from './widgets/editor/tile-palette.geometry.spec.js'
import terrainDefineDialogModelSuite from './widgets/tiles/terrain-define-dialog.model.spec.js'
import tileSheetGeometrySuite from './widgets/editor/tile-sheet.geometry.spec.js'
import sheetThumbnailGeometrySuite from './widgets/tiles/sheet-thumbnail.geometry.spec.js'
import touchGestureSuite from './widgets/engine/touch-gesture.spec.js'
import virtualStickSuite from './widgets/engine/virtual-stick.spec.js'

run({
  addAnimationDialogModelSuite,
  animationCellModelSuite,
  animationSequenceSuite,
  animationTimelineGeometrySuite,
  atlasCameraSuite,
  atlasCanvasGeometrySuite,
  atlasOverviewGeometrySuite,
  bakeCacheSuite,
  bespokeEditorsModelSuite,
  brushBadgeGeometrySuite,
  chromeStagesSuite,
  characterAnimationSuite,
  componentInspectorModelSuite,
  textListModelSuite,
  textLanguageModelSuite,
  depthGlyphGeometrySuite,
  doorTargetModelSuite,
  entityComponentsEditorModelSuite,
  conditionModelSuite,
  eventActionModelSuite,
  flagPickerModelSuite,
  layerSectionsSuite,
  mapConnectionsModelSuite,
  mapPreviewGeometrySuite,
  mapPreviewOpsSuite,
  mapSummaryModelSuite,
  placeholdersSuite,
  recentTilesGeometrySuite,
  sceneCardDragSuite,
  sheetDetentsSuite,
  sheetSlicersSuite,
  sheetThumbnailGeometrySuite,
  spriteSetImportModelSuite,
  teleportOverlayGeometrySuite,
  terrainDefineDialogModelSuite,
  terrainThumbnailGeometrySuite,
  tilePaletteGeometrySuite,
  tileSheetGeometrySuite,
  touchGestureSuite,
  virtualStickSuite,
})
