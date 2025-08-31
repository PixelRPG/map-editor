import { RpcRequest, WireRpcResponse } from '@pixelrpg/message-channel-core'

/**
 * Interface for WebKit message handler following Apple's WebKit API standard
 */
export interface WebKitMessageHandler {
  /**
   * Standard WebKit method for posting messages from JavaScript to native code
   * @param message Message to post
   */
  postMessage(message: RpcRequest | WireRpcResponse): void
}
