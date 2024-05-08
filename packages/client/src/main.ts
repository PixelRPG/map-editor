import { MessagesService } from '@pixelrpg/messages-webview'

const messagesService = new MessagesService('pixelrpg')

messagesService.send({
  type: 'text',
  data: 'Hello from the WebView',
})


messagesService.onMessage((message) => {
  console.log('Message from GJS:', message)
})

