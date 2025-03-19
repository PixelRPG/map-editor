import { StoryModule, StoryRegistry, StoryWidgetConstructor } from '../types/story'
import { StoryWidget } from '../widgets/story.widget'

/**
 * Service to manage story registrations
 */
export class StoryRegistryService implements StoryRegistry {
    private modules: StoryModule[] = []

    /**
     * Register a story module
     * @param storyModule The story module to register
     */
    public registerStory(storyModule: StoryModule): void {
        this.modules.push(storyModule)
    }

    /**
     * Register multiple story modules
     * @param storyModules The story modules to register
     */
    public registerStories(storyModules: StoryModule[]): void {
        this.modules.push(...storyModules)
    }

    /**
     * Get all registered story modules
     * @returns An array of all registered story modules
     */
    public getStories(): StoryModule[] {
        return this.modules
    }

    /**
     * Create instances of all registered story widgets and update the modules
     * This should be called when GTK is ready
     * @returns The updated modules with instances
     */
    public createStoryInstances(): StoryModule[] {
        // Create instances for each module
        this.modules.forEach(module => {
            // Create instance array if not exists
            if (!module.instances) {
                module.instances = []
            }

            // Create instances for each story class
            module.stories.forEach(StoryClass => {
                // Create an instance
                const instance = new StoryClass()

                // Initialize the story if the method exists
                if (typeof instance.initialize === 'function') {
                    instance.initialize()
                }

                // Add to instances array
                module.instances!.push(instance)
            })
        })

        return this.modules
    }
}

// Export singleton instance
export const registry = new StoryRegistryService() 