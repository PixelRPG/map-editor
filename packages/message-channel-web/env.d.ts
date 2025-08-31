import {
  RpcMethodRegistry,
  RpcMethodHandler,
} from '@pixelrpg/message-channel-core'

declare global {
  interface Window {
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

export {}
