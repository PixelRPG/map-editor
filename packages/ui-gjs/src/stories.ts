/**
 * UI-GJS Stories
 * Exports all story modules from the UI-GJS package
 */

import { StoryModule } from '@pixelrpg/story-gjs'
import { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
import { SpriteSheetWidgetStories } from './widgets/sprite/sprite-sheet.widget.story'

/**
 * All story modules available in the UI-GJS package
 */
export const UIStories: StoryModule[] = [
  SpriteWidgetStories,
  SpriteSheetWidgetStories,
]

// Export individual story modules for selective imports
export { SpriteWidgetStories } from './widgets/sprite/sprite.widget.story'
export { SpriteSheetWidgetStories } from './widgets/sprite/sprite-sheet.widget.story'
