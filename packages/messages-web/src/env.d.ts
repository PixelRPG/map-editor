import { MessageData, WebKitMessageHandler } from '@pixelrpg/messages-core'
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
      // Custom message receiver for backward compatibility with GJS
      messageReceivers?: {
        [handlerName: string]: {
          receive(message: MessageData<string, any>): void
        }
      }
    }

    /**
     * Legacy message receiver for backward compatibility
     * This is used to maintain compatibility with older GJS implementations
     * that call directly into the web context
     */
    // messageReceivers?: {
    //   [handlerName: string]: {
    //     /** Method to receive messages from GJS */
    //     receive(message: { type: string, data: any }): void
    //   }
    // }
  }
}

export { };

