import { Engine, DisplayMode, Loader, Color } from 'excalibur'
// import { DevTool } from '@excaliburjs/dev-tools'
import {
  TiledResource,
  TileLayer,
  IsoTileLayer,
  ObjectLayer,
  ImageLayer,
} from '@excaliburjs/plugin-tiled'

import { tilesetsToDataTilesets } from './utils/tileset.ts'

import { messagesService } from './services/messages.service.ts'
import { EditorInputSystem } from './systems/editor-input.system.ts'

messagesService.send({
  type: 'text',
  data: 'Hello from the WebView',
})

messagesService.onMessage((message) => {
  console.log('Message from GJS:', message)
})

const engine = new Engine({
  canvasElementId: 'map-view',
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  suppressPlayButton: true,

  backgroundColor: Color.Black,
})

const tileResource = new TiledResource('./assets/maps/taba_town.tmx')

const loader = new Loader([tileResource])

loader.on('afterload', async () => {
  console.debug('tileResource afterload', tileResource)
  messagesService.state.tilesets = await tilesetsToDataTilesets(tileResource.tilesets)
})

loader.backgroundColor = '#000000' // Black background color on play button

engine.currentScene.world.add(EditorInputSystem)

await engine.start(loader)
// const devtool = new DevTool(engine);

for (const layer of tileResource.layers) {
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
  if (layer instanceof IsoTileLayer) {
    // layer.isometricMap
  }
  if (layer instanceof ObjectLayer) {
    for (const entity of layer.entities) {
      // const tx = entity.get(TransformComponent)
    }
  }
  if (layer instanceof ImageLayer) {
    if (layer.imageActor) {
      // layer.imageActor
    }
  }
}

tileResource.addToScene(engine.currentScene)
