import { WebKitMessageHandler } from './types/index.ts'
import { HandlerFunction } from '@pixelrpg/message-channel-core';

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

    /**
     * RPC handlers registry
     * This object contains handler functions that can be called by the RPC server.
     * It is managed by the RpcClient.registerHandler and RpcClient.unregisterHandler methods.
     * Do not modify this object directly - use the RpcClient methods instead.
     */
    rpcHandlers?: {
      [method: string]: HandlerFunction
    }
  }
}

export { };