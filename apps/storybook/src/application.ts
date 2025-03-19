import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { StoryModule, StoryRegistry, registry } from '@pixelrpg/story-gjs'
import { StorybookWindow } from './widgets'

/**
 * Main application class for the Storybook
 * Manages the application lifecycle and story registration
 */
export class StorybookApplication extends Adw.Application {
    /** The main application window */
    private window: StorybookWindow | null = null

    /** Story registry used to manage story modules */
    private storyRegistry: StoryRegistry

    static {
        GObject.registerClass({
            GTypeName: 'StorybookApplication',
        }, this)
    }

    /**
     * Create a new Storybook application
     * @param storyRegistry - Optional custom story registry (uses global singleton by default)
     */
    constructor(storyRegistry: StoryRegistry = registry) {
        super({
            application_id: 'org.pixelrpg.storybook',
            flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
        })

        this.storyRegistry = storyRegistry
        this.connect('activate', this._onActivate.bind(this))
    }

    /**
     * Set stories to display in the application
     * @param storyModules - Story modules to display
     */
    public setStories(storyModules: StoryModule[]): void {
        if (!this.window) {
            console.warn('Cannot set stories before window is created')
            return
        }

        // Register the story modules with the registry
        this.storyRegistry.registerStories(storyModules)

        try {
            // Create instances of story widgets
            const modulesWithInstances = this.storyRegistry.createStoryInstances()

            // Populate the sidebar with the modules containing instances
            this.window.populateSidebar(modulesWithInstances)
        } catch (error) {
            console.error('Failed to create story instances:', error)
        }
    }

    /**
     * Handles application activation
     * Creates the main window if it doesn't exist
     */
    private _onActivate(): void {
        // Create the main window if it doesn't exist
        if (!this.window) {
            this.window = new StorybookWindow({ application: this })
        }

        // Show the window
        this.window.present()
    }
}

// Ensure the GType is registered
GObject.type_ensure(StorybookApplication.$gtype) 