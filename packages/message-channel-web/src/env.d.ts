import { WebKitMessageHandler } from './types/index.ts'

declare global {
  interface Window {
    /**
     * Standard WebKit interface for message handling
     * This follows the WebKit WKScriptMessageHandler standard
     */
    webkit?: {
      messageHandlers: {
        [handlerName: string]: WebKitMessageHandler | undefined
      }
    }
  }
}

export { };

