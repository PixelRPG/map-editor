import { settings } from '../settings'
import { RpcEndpoint, RpcMethodRegistry } from '@pixelrpg/message-channel-core'
import { RpcEndpoint as WebviewRpcEndpoint } from '@pixelrpg/message-channel-webview'
import {
  IframeContext,
  RpcEndpoint as WebRpcEndpoint,
} from '@pixelrpg/message-channel-web'
import { EngineRpcRegistry } from '@pixelrpg/engine-core'

let rpcEndpoint: RpcEndpoint | null = null

/**
 * Create an RPC endpoint instance based on the runtime environment
 * @param messageHandlerName Name of the message handler channel
 * @returns RPC endpoint instance
 */
export const rpcEndpointFactory = <
  T extends RpcMethodRegistry = EngineRpcRegistry,
>(
  messageHandlerName = 'pixelrpg',
): RpcEndpoint<T> => {
  return (rpcEndpoint ||= settings.isWebKitView
    ? WebviewRpcEndpoint.getInstance<T>(messageHandlerName)
    : WebRpcEndpoint.getInstance<T>(messageHandlerName, {
        context: IframeContext.CHILD,
        targetOrigin: '*',
      })) as RpcEndpoint<T>
}

// Re-export types for convenience
export type { RpcEndpoint, RpcMethodRegistry }
