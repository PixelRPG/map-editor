/**
 * UI-GJS Stories
 * Exports all story modules from the UI-GJS package
 */

import GObject from '@girs/gobject-2.0'
import type { StoryModule } from '@pixelrpg/story-gjs'

// Legacy stories (sprite + old map-editor panel).
import { LayerSelector } from './widgets/map-editor/layer-selector'
import { MapEditorPanel } from './widgets/map-editor/map-editor-panel'
import { MapEditorPanelStories } from './widgets/map-editor/map-editor-panel.story'
import { TilesetSelector } from './widgets/map-editor/tileset-selector'
import { TilesetSelectorStories } from './widgets/map-editor/tileset-selector.story'
import { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
// SpriteSheetWidgetStories intentionally omitted — its role is being
// folded into `Editor/Tile Palette · Lokiri Forest`. The widget itself
// still exists because MapEditorPanel uses it; it gets removed together
// with MapEditorPanel in Phase 4.

// Adwaita-redesigned editor stories.
import { AtlasCanvas } from './widgets/editor/atlas-canvas'
import { AtlasCanvasStories } from './widgets/editor/atlas-canvas.story'
import { ContextChip } from './widgets/editor/context-chip'
import { ContextChipStories } from './widgets/editor/context-chip.story'
import { FloatingToolRail } from './widgets/editor/floating-tool-rail'
import { FloatingToolRailStories } from './widgets/editor/floating-tool-rail.story'
import { FloatingZoom } from './widgets/editor/floating-zoom'
import { FloatingZoomStories } from './widgets/editor/floating-zoom.story'
import { LayerRow } from './widgets/editor/layer-row'
import { LayerRowStories } from './widgets/editor/layer-row.story'
import { LayersTab } from './widgets/editor/layers-tab'
import { MiniMap } from './widgets/editor/mini-map'
import { ModeRail } from './widgets/editor/mode-rail'
import { ModeRailStories } from './widgets/editor/mode-rail.story'
import { ProjectHeroIcon } from './widgets/editor/project-hero-icon'
import { ProjectHeroIconStories } from './widgets/editor/project-hero-icon.story'
import { PropsTab } from './widgets/editor/props-tab'
import { RightInspector } from './widgets/editor/right-inspector'
import { RightInspectorStories } from './widgets/editor/right-inspector.story'
import { SceneCard } from './widgets/editor/scene-card'
import { SceneEditor } from './widgets/editor/scene-editor'
import { SceneEditorStories } from './widgets/editor/scene-editor.story'
import { SceneInspector } from './widgets/editor/scene-inspector'
import { SceneInspectorStories } from './widgets/editor/scene-inspector.story'
import { TeleportOverlay } from './widgets/editor/teleport-overlay'
import { TilePalette } from './widgets/editor/tile-palette'
import { TilePaletteStories } from './widgets/editor/tile-palette.story'
import { TilesTab } from './widgets/editor/tiles-tab'

// Force widget registration up-front so any composite template that
// references one of these by GTypeName resolves at template-parse time.
GObject.type_ensure(TilesetSelector.$gtype)
GObject.type_ensure(LayerSelector.$gtype)
GObject.type_ensure(MapEditorPanel.$gtype)
GObject.type_ensure(ProjectHeroIcon.$gtype)
GObject.type_ensure(ModeRail.$gtype)
GObject.type_ensure(MiniMap.$gtype)
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(LayerRow.$gtype)
GObject.type_ensure(TilesTab.$gtype)
GObject.type_ensure(LayersTab.$gtype)
GObject.type_ensure(PropsTab.$gtype)
GObject.type_ensure(RightInspector.$gtype)
GObject.type_ensure(FloatingToolRail.$gtype)
GObject.type_ensure(FloatingZoom.$gtype)
GObject.type_ensure(ContextChip.$gtype)
GObject.type_ensure(SceneCard.$gtype)
GObject.type_ensure(TeleportOverlay.$gtype)
GObject.type_ensure(AtlasCanvas.$gtype)
GObject.type_ensure(SceneInspector.$gtype)
GObject.type_ensure(SceneEditor.$gtype)

/** All story modules available in the UI-GJS package. */
export const UIStories: StoryModule[] = [
  SpriteWidgetStories,
  MapEditorPanelStories,
  TilesetSelectorStories,
  ProjectHeroIconStories,
  ModeRailStories,
  TilePaletteStories,
  LayerRowStories,
  RightInspectorStories,
  FloatingToolRailStories,
  FloatingZoomStories,
  ContextChipStories,
  AtlasCanvasStories,
  SceneInspectorStories,
  SceneEditorStories,
]

export { MapEditorPanelStories } from './widgets/map-editor/map-editor-panel.story'
export { TilesetSelectorStories } from './widgets/map-editor/tileset-selector.story'
export { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
export {
  AtlasCanvasStories,
  ContextChipStories,
  FloatingToolRailStories,
  FloatingZoomStories,
  LayerRowStories,
  ModeRailStories,
  ProjectHeroIconStories,
  RightInspectorStories,
  SceneEditorStories,
  SceneInspectorStories,
  TilePaletteStories,
}
