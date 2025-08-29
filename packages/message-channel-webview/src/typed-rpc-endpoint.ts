import { TypedRpcEndpointBase } from '@pixelrpg/message-channel-core'
import { RpcEndpoint as WebviewRpcEndpoint } from './rpc-endpoint'

/**
 * Type-safe WebView RPC endpoint
 */
export class TypedRpcEndpoint extends TypedRpcEndpointBase {
  private webviewEndpoint: WebviewRpcEndpoint

  /**
   * Registry of all created typed endpoints by channel name
   */
  private static instances: Map<string, TypedRpcEndpoint> = new Map()

  /**
   * Get or create a typed RPC endpoint for a specific channel
   * @param channelName Name of the channel
   * @returns A typed RPC endpoint instance for the specified channel
   */
  public static getInstance(channelName: string): TypedRpcEndpoint {
    if (!this.instances.has(channelName)) {
      this.instances.set(channelName, new TypedRpcEndpoint(channelName))
    }
    return this.instances.get(channelName)!
  }

  /**
   * Create a new typed WebView RPC endpoint
   * Use TypedRpcEndpoint.getInstance() instead of calling the constructor directly
   */
  private constructor(channelName: string) {
    super(channelName)
    this.webviewEndpoint = WebviewRpcEndpoint.getInstance(channelName)
  }

  /**
   * Delegate to the WebView endpoint for message posting
   */
  protected async postMessage(message: any): Promise<void> {
    return this.webviewEndpoint['postMessage'](message)
  }

  /**
   * Clean up resources
   */
  public override destroy(): void {
    super.destroy()
    this.webviewEndpoint.destroy()

    // Remove from instances registry
    TypedRpcEndpoint.instances.delete(this.channelName)
  }
}
