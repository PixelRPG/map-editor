import { settings } from "../settings"
import { RpcEndpoint } from '@pixelrpg/message-channel-core'
import { RpcEndpoint as WebviewRpcEndpoint } from '@pixelrpg/message-channel-webview'
import { IframeContext, RpcEndpoint as WebRpcEndpoint } from '@pixelrpg/message-channel-web'

let rpcEndpoint: RpcEndpoint | null = null

export const rpcEndpointFactory = (messageHandlerName = 'pixelrpg'): RpcEndpoint => {
    return rpcEndpoint ||= settings.isWebKitView ? WebviewRpcEndpoint.getInstance(messageHandlerName) : WebRpcEndpoint.getInstance(messageHandlerName, {
        context: IframeContext.CHILD,
        targetOrigin: '*'
    })
}