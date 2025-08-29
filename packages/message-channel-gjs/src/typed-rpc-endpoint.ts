import WebKit from '@girs/webkit-6.0'
import { TypedRpcEndpointBase } from '@pixelrpg/message-channel-core'
import { RpcEndpoint as GjsRpcEndpoint } from './rpc-endpoint'

/**
 * Type-safe GJS RPC endpoint
 */
export class TypedRpcEndpoint extends TypedRpcEndpointBase {
  private gjsEndpoint: GjsRpcEndpoint

  /**
   * Registry of all created typed endpoints by channel name and WebView
   */
  private static instances: Map<string, TypedRpcEndpoint> = new Map()

  /**
   * Get or create a typed RPC endpoint for a specific channel and WebView
   * @param channelName Name of the channel
   * @param webView WebKit WebView instance
   * @returns A typed RPC endpoint instance for the specified channel and WebView
   */
  public static getInstance(channelName: string, webView: WebKit.WebView): TypedRpcEndpoint {
    const instanceKey = `${channelName}:${webView.toString()}`

    if (!this.instances.has(instanceKey)) {
      this.instances.set(instanceKey, new TypedRpcEndpoint(channelName, webView))
    }
    return this.instances.get(instanceKey)!
  }

  /**
   * Create a new typed GJS RPC endpoint
   * Use TypedRpcEndpoint.getInstance() instead of calling the constructor directly
   */
  private constructor(channelName: string, webView: WebKit.WebView) {
    super(channelName)
    this.gjsEndpoint = GjsRpcEndpoint.getInstance(channelName, webView)
  }

  /**
   * Delegate to the GJS endpoint for message posting
   */
  protected async postMessage(message: any): Promise<void> {
    return this.gjsEndpoint['postMessage'](message)
  }

  /**
   * Clean up resources
   */
  public override destroy(): void {
    super.destroy()
    this.gjsEndpoint.destroy()

    // Remove from instances registry
    const instanceKey = `${this.channelName}:${this.gjsEndpoint.toString()}`
    TypedRpcEndpoint.instances.delete(instanceKey)
  }
}
