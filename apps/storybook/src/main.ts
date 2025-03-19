import system from 'system'
import { StorybookApplication } from './application'
import { StoryRegistryService } from '@pixelrpg/story-gjs'
// TODO: Remove this
// import './main.css?inline'
import { EngineStoryWidget } from '@pixelrpg/engine-gjs/stories'


// Create the registry
const registry = new StoryRegistryService()

console.log("Registering stories...")

// Register stories
// registry.registerStories([{
//     stories: [new EngineStoryWidget({
//         story: 'Basic',
//         args: {
//             width: 800,
//             height: 600,
//         },
//         meta: EngineStoryWidget.getMetadata()
//     })]
// }])

// Create and run the application
const app = new StorybookApplication()
app.connect('activate', () => {
    console.log("Activating application")
    registry.registerStories([{
        stories: [new EngineStoryWidget({
            story: 'Basic',
            args: {
                width: 800,
                height: 600,
            },
            meta: EngineStoryWidget.getMetadata()
        })]
    }])
    app.setStories(registry.getStories())
})

const exitCode = await app.runAsync([])
log('exitCode: ' + exitCode)

// Exit the application
system.exit(exitCode)