import type Gtk from '@girs/gtk-4.0'
import type { StoryWidget } from '@pixelrpg/story-gjs'

/**
 * Custom row type for story rows that store a reference to their story widget
 */
export interface StoryRow extends Gtk.ListBoxRow {
    storyWidget: StoryWidget;
}
