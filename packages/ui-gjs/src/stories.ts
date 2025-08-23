/**
 * UI-GJS Stories
 * Exports all story modules from the UI-GJS package
 */

import { StoryModule } from '@pixelrpg/story-gjs'
import { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
import { SpriteSheetWidgetStories } from './widgets/sprite/sprite-sheet.widget.story'
import { MapEditorPanelStories } from './widgets/map-editor/map-editor-panel.story'

// Ensure all widgets are registered before stories are used
import { MapEditorPanel } from './widgets/map-editor/map-editor-panel'
import { TilesetSelector } from './widgets/map-editor/tileset-selector'
import { LayerSelector } from './widgets/map-editor/layer-selector'
import GObject from '@girs/gobject-2.0'

// Force widget registration
GObject.type_ensure(TilesetSelector.$gtype)
GObject.type_ensure(LayerSelector.$gtype)
GObject.type_ensure(MapEditorPanel.$gtype)

/**
 * All story modules available in the UI-GJS package
 */
export const UIStories: StoryModule[] = [
  SpriteWidgetStories,
  SpriteSheetWidgetStories,
  MapEditorPanelStories,
]

// Export individual story modules for selective imports
export { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
export { SpriteSheetWidgetStories } from './widgets/sprite/sprite-sheet.widget.story'
export { MapEditorPanelStories } from './widgets/map-editor/map-editor-panel.story'
