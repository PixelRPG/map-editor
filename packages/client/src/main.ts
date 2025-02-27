import { Engine, DisplayMode, Loader, Color } from 'excalibur'
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
import { MapData } from '@pixelrpg/map-format-core'

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

// Load and parse the map data
const response = await fetch('./assets/maps/kokiri-forest.json')
const mapData = await response.json() as MapData
console.log('mapData', mapData)

// Create our custom map resource with basePath for loading external tilesets
const mapResource = new MapResource(mapData, {
  basePath: './' // Base path for loading external resources
})

const loader = new Loader([mapResource])

loader.on('afterload', async () => {
  console.debug('mapResource afterload', mapResource)
})

loader.backgroundColor = '#000000' // Black background color on play button

engine.currentScene.world.add(EditorInputSystem)

await engine.start(loader)
// const devtool = new DevTool(engine);

// Get the TileMap from our resource
const tileMap = mapResource.data;
if (tileMap) {
  for (const tile of tileMap.tiles) {
    tile.on('pointerdown', () => {
      console.log('Tile pointerdown', tile)
      for (const graphic of tile.getGraphics()) {
        graphic.opacity = 0.5
      }
    })
    tile.on('pointerup', () => {
      console.log('Tile pointerup', tile)
      for (const graphic of tile.getGraphics()) {
        graphic.opacity = 1
      }
    })
  }
}

mapResource.addToScene(engine.currentScene)
