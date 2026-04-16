import system from 'system'
import { StorybookApplication } from './application'
import { StoryRegistryService } from '@pixelrpg/story-gjs'
import { UIStories } from '@pixelrpg/ui-gjs'

// Create the registry
const registry = new StoryRegistryService()

// Create and run the application
const app = new StorybookApplication()
app.connect('activate', () => {
    console.log("Activating application")

    // Register story modules
    registry.registerStories([...UIStories])

    // Set up stories in the application
    app.setStories(registry.getStories())
})

const exitCode = await app.runAsync([])
log('exitCode: ' + exitCode)

// Exit the application
system.exit(exitCode)