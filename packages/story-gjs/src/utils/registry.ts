import { StoryModule, StoryRegistry } from '../types'

/**
 * Service to manage story registrations
 */
export class StoryRegistryService implements StoryRegistry {
    private stories: StoryModule[] = []

    /**
     * Register a story module
     * @param storyModule The story module to register
     */
    registerStory(storyModule: StoryModule): void {
        this.stories.push(storyModule)
    }

    /**
     * Register multiple story modules
     * @param storyModules The story modules to register
     */
    registerStories(storyModules: StoryModule[]): void {
        storyModules.forEach(module => this.registerStory(module))
    }

    /**
     * Get all registered story modules
     * @returns An array of all registered story modules
     */
    getStories(): StoryModule[] {
        return this.stories
    }
} 