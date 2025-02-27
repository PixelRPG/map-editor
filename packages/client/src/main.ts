import { Engine, DisplayMode, Loader, Color, Logger } from 'excalibur'
// import { DevTool } from '@excaliburjs/dev-tools'
import {
  TileLayer,
  // IsoTileLayer,
  // ObjectLayer,
  // ImageLayer,
} from '@excaliburjs/plugin-tiled'

import { messagesService } from './services/messages.service.ts'
import { EditorInputSystem } from './systems/editor-input.system.ts'

import { MapResource } from '@pixelrpg/map-format-excalibur'

// Set up logging
const logger = Logger.getInstance();
// Enable debug logging in the browser console
console.debug = console.log; // Ensure debug messages are visible
logger.info('Starting map editor application');

// TODO: Use serialisation from @pixelrpg/map-format-excalibur
// import { TilesetParser } from './parser/tileset.parser.ts'
// import { ResourceParser } from './parser/resource.parser.ts'
// import { MapParser } from './parser/map.parser.ts'
// import { LayerParser } from './parser/layer.parser.ts'

// Send a message to GJS
messagesService.send({
  type: 'text',
  data: 'Hello from the WebView',
})

// Receive a message from GJS
messagesService.onMessage((message) => {
  console.log('Message from GJS:', message)
})

// Create the Excalibur engine
const engine = new Engine({
  canvasElementId: 'map-view',
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  suppressPlayButton: true,
  backgroundColor: Color.Black,
})

// Define the path to the map file
// Use absolute path from the server root to avoid path resolution issues
const mapPath = 'assets/maps/kokiri-forest.json';
logger.info(`Creating MapResource with path: ${mapPath}`);
const mapResource = new MapResource(mapPath);

const loader = new Loader([mapResource]);

loader.on('progress', (event) => {
  // Cast event to any to access the progress property
  const loadEvent = event as any;
  if (loadEvent && typeof loadEvent.progress === 'number') {
    logger.debug(`Loading progress: ${Math.round(loadEvent.progress * 100)}%`);
  }
});

loader.on('error', (error) => {
  logger.error('Loader error:', error);
});

loader.on('complete', () => {
  logger.info('Loading complete');
});

loader.on('afterload', async () => {
  logger.info('MapResource loaded successfully');

  // Debug the map resource
  mapResource.debugInfo();
})

loader.backgroundColor = '#000000' // Black background color on play button

engine.currentScene.world.add(EditorInputSystem)

logger.info('Starting engine');
await engine.start(loader)
// const devtool = new DevTool(engine);

// Get the TileMap from our resource
const tileMap = mapResource.data;
if (tileMap) {
  logger.info(`TileMap loaded with ${tileMap.tiles.length} tiles`);

  // Add click handlers to tiles
  for (const tile of tileMap.tiles) {
    tile.on('pointerdown', () => {
      logger.info(`Tile clicked at (${tile.x}, ${tile.y})`);
      for (const graphic of tile.getGraphics()) {
        graphic.opacity = 0.5;
      }
    });

    tile.on('pointerup', () => {
      logger.info(`Tile released at (${tile.x}, ${tile.y})`);
      for (const graphic of tile.getGraphics()) {
        graphic.opacity = 1;
      }
    });
  }
}

// Add the map to the scene
mapResource.addToScene(engine.currentScene);
logger.info('Map added to scene');
