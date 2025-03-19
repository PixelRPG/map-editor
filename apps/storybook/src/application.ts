import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { StoryModule, StoryRegistry, StoryWidget } from '@pixelrpg/story-gjs'
import { StorybookWindow } from './widgets'

export class StorybookApplication extends Adw.Application {
    private window: StorybookWindow | null = null
    // private registry: StoryRegistry

    static {
        GObject.registerClass({
            GTypeName: 'StorybookApplication',
        }, this)
    }

    constructor(/*registry: StoryRegistry*/) {
        super({
            application_id: 'org.pixelrpg.storybook',
            flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
        })

        // this.registry = registry
        this.connect('activate', this._onActivate.bind(this))
    }

    public setStories(stories: StoryModule[]) {
        stories.forEach(story => {
            story.stories.forEach(story => {
                console.log("Initializing story: " + story.meta.title)
                story.initialize()
            })
        })

        // Populate the sidebar with stories
        this.window!.populateSidebar(stories)
    }

    /**
     * Handles application activation
     */
    private _onActivate(): void {
        console.log("Activating application")
        // Create the main window if it doesn't exist
        if (!this.window) {
            this.window = new StorybookWindow({ application: this })

            // Get all stories from the registry
            // const stories = this.registry.getStories()


        }

        // Show the window
        this.window.present()
    }
}

GObject.type_ensure(StorybookApplication.$gtype) 