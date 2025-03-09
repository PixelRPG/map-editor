import { Logger } from 'excalibur'
import { ExcaliburEngine } from './services/excalibur-engine.ts'
import './main.css'
import { settings } from './settings.ts';

// Set up logging
const logger = Logger.getInstance();
// Enable debug logging in the browser console
console.debug = console.log;
logger.info('Starting map editor application');

// Create and initialize the engine
const engine = new ExcaliburEngine('map-view');
await engine.initialize();

// If this is in preview mode, load the project for demo purposes
// if (!settings.isWebKitView) {
// The engine will handle messages from GJS to load projects and maps
engine.loadProject('./assets/game-project.json')
// }