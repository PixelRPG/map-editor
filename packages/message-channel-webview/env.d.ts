import { WebKitMessageHandler } from './src/types'
import {
  RpcMethodRegistry,
  RpcMethodHandler,
} from '@pixelrpg/message-channel-core'

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
     * It is managed by the RpcEndpoint.registerHandler and RpcEndpoint.unregisterHandler methods.
     * Do not modify this object directly - use the RpcEndpoint methods instead.
     */
    rpcHandlers?: {
      [method: string]: RpcMethodHandler<
        RpcMethodRegistry,
        keyof RpcMethodRegistry
      >
    }
  }
}
