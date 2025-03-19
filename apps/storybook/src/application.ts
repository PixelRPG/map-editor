import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { StoryModule, StoryRegistry, StoryWidget, registry } from '@pixelrpg/story-gjs'
import { StorybookWindow } from './widgets'

export class StorybookApplication extends Adw.Application {
    private window: StorybookWindow | null = null
    private registry: StoryRegistry

    static {
        GObject.registerClass({
            GTypeName: 'StorybookApplication',
        }, this)
    }

    constructor(storyRegistry: StoryRegistry = registry) {
        super({
            application_id: 'org.pixelrpg.storybook',
            flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
        })

        this.registry = storyRegistry
        this.connect('activate', this._onActivate.bind(this))
    }

    /**
     * Set stories to display in the application
     * @param storyModules Story modules to display
     */
    public setStories(storyModules: StoryModule[]): void {
        // Register the story modules with the registry
        this.registry.registerStories(storyModules)

        // Create instances of story widgets
        const modulesWithInstances = this.registry.createStoryInstances()

        // Populate the sidebar with the modules containing instances
        this.window?.populateSidebar(modulesWithInstances)
    }

    /**
     * Handles application activation
     */
    private _onActivate(): void {
        console.log("Activating application")
        // Create the main window if it doesn't exist
        if (!this.window) {
            this.window = new StorybookWindow({ application: this })
        }

        // Show the window
        this.window.present()
    }
}

GObject.type_ensure(StorybookApplication.$gtype) 