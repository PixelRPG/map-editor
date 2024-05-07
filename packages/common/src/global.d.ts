interface WebkitMessageHandler {
  postMessage(message: string | object): void
}

interface Window {
  webkit: {
    messageHandlers: {
      [handlerName: string]: WebkitMessageHandler | undefined
    }
  }
}
