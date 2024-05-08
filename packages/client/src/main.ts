import { Engine, DisplayMode } from 'excalibur'
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
  width: 800,
  height: 600,
  displayMode: DisplayMode.FillScreen,
  antialiasing: false,
  canvasElementId: 'editor-view',
})

console.log('game', game)

game.start()