import { Logger } from 'excalibur'
import { Engine } from './engine.ts'
import { settings } from './settings.ts';

// Set up logging
const logger = Logger.getInstance();
logger.info('Starting map editor application');

// Create and initialize the engine
window.engine = new Engine();
await window.engine.initialize();

// If this is in preview mode, load the project for demo purposes
if (!settings.isWebKitView) {
    // The engine will handle messages from GJS to load projects and maps
    // window.engine.loadProject('./assets/game-project.json')
}