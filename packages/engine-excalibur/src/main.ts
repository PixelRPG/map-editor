import { Logger } from 'excalibur'
import { ExcaliburEngine } from './services/excalibur-engine.ts'
import './main.css'

// Set up logging
const logger = Logger.getInstance();
// Enable debug logging in the browser console
console.debug = console.log;
logger.info('Starting map editor application');

// Create and initialize the engine
const engine = new ExcaliburEngine('map-view');
await engine.initialize();

// The engine will handle messages from GJS to load projects and maps
engine.loadProject('./assets/game-project.json')