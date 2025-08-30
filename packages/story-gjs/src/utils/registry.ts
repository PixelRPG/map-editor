import { StoryModule, StoryRegistry, StoryWidgetConstructor } from '../types/story'
import { StoryWidget } from '../widgets/story.widget'

/**
 * Service that manages story module registration and instantiation
 */
export class StoryRegistryService implements StoryRegistry {
    private modules: StoryModule[] = []

    /**
     * Register a single story module
     * @param storyModule - The story module to register
     */
    public registerStory(storyModule: StoryModule): void {
        if (!storyModule || !Array.isArray(storyModule.stories)) {
            console.warn('Invalid story module provided to registerStory')
            return
        }

        this.modules.push(storyModule)
    }

    /**
     * Register multiple story modules
     * @param storyModules - Array of story modules to register
     */
    public registerStories(storyModules: StoryModule[]): void {
        if (!Array.isArray(storyModules)) {
            console.warn('Invalid story modules array provided to registerStories')
            return
        }

        // Filter out invalid modules
        const validModules = storyModules.filter(module =>
            module && Array.isArray(module.stories)
        )

        this.modules.push(...validModules)
    }

    /**
     * Get all registered story modules
     * @returns Array of all registered story modules
     */
    public getStories(): StoryModule[] {
        return [...this.modules]
    }

    /**
     * Create instances of all registered story widgets and update the modules
     * This should be called when GTK is ready to render widgets
     * @returns Updated modules with initialized story instances
     */
    public createStoryInstances(): StoryModule[] {
        this.modules.forEach(this.instantiateStoriesForModule.bind(this))
        return [...this.modules]
    }

    /**
     * Create and initialize story instances for a specific module
     * @param module - The story module to process
     */
    private instantiateStoriesForModule(module: StoryModule): void {
        // Initialize instances array if needed
        if (!module.instances) {
            module.instances = []
        }

        // Create instances for each story class
        module.stories.forEach(StoryClass => {
            try {
                // Create an instance
                const instance = new StoryClass()

                // Initialize the story if it has an initialize method
                if (typeof instance.initialize === 'function') {
                    instance.initialize()
                }

                // Add to instances array
                module.instances!.push(instance)
            } catch (error) {
                console.error(
                    `Failed to instantiate story widget: ${StoryClass.name || 'Unknown'}`,
                    error
                )
            }
        })
    }
}

/**
 * Singleton instance of the story registry service
 */
export const registry = new StoryRegistryService() 