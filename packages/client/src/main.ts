import { Engine, DisplayMode, Loader, Color } from 'excalibur'
// import { DevTool } from '@excaliburjs/dev-tools'
import {
  TiledResource,
  TileLayer,
  // IsoTileLayer,
  // ObjectLayer,
  // ImageLayer,
} from '@excaliburjs/plugin-tiled'

import { TilesetParser } from './parser/tileset.parser.ts'
import { ResourceParser } from './parser/resource.parser.ts'
import { MapParser } from './parser/map.parser.ts'
import { LayerParser } from './parser/layer.parser.ts'
import { messagesService } from './services/messages.service.ts'
import { EditorInputSystem } from './systems/editor-input.system.ts'

import type { Layer } from '@pixelrpg/common'

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

const tiledResource = new TiledResource('./assets/maps/kokiri-forest.tmx')

const loader = new Loader([tiledResource])

loader.on('afterload', async () => {
  console.debug('tiledResource afterload', tiledResource)
  const resourceParser = new ResourceParser({
    basePath: window.location.origin,
  })

  // TODO: ALso use `tiledResource.map.tilesets`?
  messagesService.state.tilesets = await new TilesetParser({
    resourceParser,
  }).parseAll(tiledResource.tilesets)

  messagesService.state.map = await new MapParser({
    resourceParser,
  }).parse(tiledResource.map)

  messagesService.state.layers = await new LayerParser({
    resourceParser,
  }).parseAll(tiledResource.layers as Layer[])

  // Use this at the end, after all parsing is done because they set the resources
  messagesService.state.resources = resourceParser.resources

})

loader.backgroundColor = '#000000' // Black background color on play button

engine.currentScene.world.add(EditorInputSystem)

await engine.start(loader)
// const devtool = new DevTool(engine);

for (const layer of tiledResource.layers) {
  if (layer instanceof TileLayer) {
    for (const tile of layer.tilemap.tiles) {
      // TODO: forward these events to the tile
      // tile.on('pointerenter', () => {
      //   console.log('Tile pointerenter', tile)
      // })
      // tile.on('pointerleave', () => {
      //   console.log('Tile pointerleave', tile)
      // })
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
  // if (layer instanceof IsoTileLayer) {
  //   layer.isometricMap
  // }
  // if (layer instanceof ObjectLayer) {
  //   for (const entity of layer.entities) {
  //     const tx = entity.get(TransformComponent)
  //   }
  // }
  // if (layer instanceof ImageLayer) {
  //   if (layer.imageActor) {
  //     layer.imageActor
  //   }
  // }
}

tiledResource.addToScene(engine.currentScene)
