import { Engine, DisplayMode, Loader, Color } from 'excalibur'
// import { DevTool } from '@excaliburjs/dev-tools'
import { TiledResource } from '@excaliburjs/plugin-tiled'
import { MessagesService } from '@pixelrpg/messages-webview'

const messagesService = new MessagesService('pixelrpg')

messagesService.send({
  type: 'text',
  data: 'Hello from the WebView',
})

messagesService.onMessage((message) => {
  console.log('Message from GJS:', message)
})

const game = new Engine({
  canvasElementId: 'map-view',
  displayMode: DisplayMode.FillScreen,
  pixelArt: true,
  suppressPlayButton: true,

  backgroundColor: Color.Black,
})

const tiledMap = new TiledResource('./assets/maps/taba_town.tmx');
const loader = new Loader([tiledMap]);
loader.backgroundColor = "#000000" // Black background color on play button

await game.start(loader);
// const devtool = new DevTool(game);
tiledMap.addToScene(game.currentScene);

