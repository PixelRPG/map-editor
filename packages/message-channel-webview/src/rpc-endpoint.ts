import {
  RpcEndpoint as CoreRpcEndpoint,
  type MessageEvent,
  type RpcRequest,
  type WireRpcResponse,
  type RpcMethodRegistry,
  type RpcMethodHandler,
  type RpcMethodParams,
} from '@pixelrpg/message-channel-core'
import { WebKitMessageHandler } from './types/webkit-message-handler'
import {
  serializeMessage,
  createTransmissionError,
} from '@pixelrpg/message-channel-core/utils/serialization'

/**
 * WebView implementation of the RPC endpoint
 * Handles communication with parent window or iframe using direct browser APIs
 */
export class RpcEndpoint<
  T extends RpcMethodRegistry = RpcMethodRegistry,
> extends CoreRpcEndpoint<T> {
  /**
   * Registry of all created endpoints by channel name
   */
  private static instances: Map<string, RpcEndpoint<any>> = new Map()

  /**
   * Get or create an RPC endpoint for a specific channel
   * @param channelName Name of the channel
   * @returns An RPC endpoint instance for the specified channel
   */
  public static getInstance<T extends RpcMethodRegistry = RpcMethodRegistry>(
    channelName: string,
  ): RpcEndpoint<T> {
    if (!this.instances.has(channelName)) {
      this.instances.set(channelName, new RpcEndpoint<T>(channelName))
    }
    return this.instances.get(channelName)!
  }

  /**
   * WebKit message handler reference, if available
   */
  private webKitHandler: WebKitMessageHandler | null

  /**
   * Create a new WebView RPC endpoint with direct browser API access
   * Use RpcEndpoint.getInstance() instead of calling the constructor directly
   * @param channelName Name of the channel
   */
  protected constructor(channelName: string) {
    super(channelName)

    // Try to get WebKit message handler if available
    this.webKitHandler = window.webkit?.messageHandlers[channelName] || null

    // Set up event listener for receiving messages
    window.addEventListener('message', this.handleMessageEvent)
  }

  /**
   * Register a handler function that can be called by the other endpoint
   * @param methodName Name of the method to register
   * @param handler Function to handle the method call
   */
  public override registerHandler<K extends keyof T>(
    methodName: K,
    handler: RpcMethodHandler<T, K>,
  ): void {
    // Call the parent method to register the handler internally
    super.registerHandler(methodName, handler)

    // Also register in the global window.rpcHandlers object for external access
    if (!window.rpcHandlers) {
      window.rpcHandlers = {}
    }

    // Register the handler
    window.rpcHandlers[methodName as string] = async (params?: unknown) => {
      try {
        // Call the handler and return its result
        return await Promise.resolve(handler(params as RpcMethodParams<T, K>))
      } catch (error) {
        // Convert errors to a standard format
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        console.error(
          `Error in RPC handler for method "${String(methodName)}":`,
          error,
        )

        // Re-throw as an object with message to ensure proper serialization
        throw { message: errorMessage }
      }
    }

    console.debug(`Registered RPC handler for method: ${String(methodName)}`)
  }

  /**
   * Unregister a previously registered handler
   * @param methodName Name of the method to unregister
   */
  public override unregisterHandler<K extends keyof T>(methodName: K): void {
    // Call the parent method to unregister the handler internally
    super.unregisterHandler(methodName)

    // Also unregister from the global window.rpcHandlers object
    if (window.rpcHandlers && window.rpcHandlers[methodName as string]) {
      delete window.rpcHandlers[methodName as string]
      console.debug(
        `Unregistered RPC handler for method: ${String(methodName)}`,
      )
    }
  }

  /**
   * Send an RPC request or response message
   * @param message The RPC message to send
   */
  protected async postMessage(
    message: RpcRequest | WireRpcResponse,
  ): Promise<void> {
    // Set channel if not already set
    if (message.channel === undefined) {
      message.channel = this.channelName
    }

    try {
      // Try WebKit handler first if available
      if (this.webKitHandler) {
        this.webKitHandler.postMessage(message)
        return
      }

      // Fall back to window.postMessage
      if (window.parent && window.parent !== window) {
        // Use standardized serialization for consistency
        const serializedMessage = serializeMessage(message)
        const parsedMessage = JSON.parse(serializedMessage) // Ensure clean object
        window.parent.postMessage(parsedMessage, '*')
        return
      }

      throw new Error('No valid message target available')
    } catch (error) {
      console.error('Error sending message from WebView:', error)
      const transmissionError = createTransmissionError(error, 'WebView')
      throw new Error(transmissionError.message)
    }
  }

  /**
   * Event handler for incoming messages
   */
  private handleMessageEvent = (event: Event): void => {
    const messageEvent = event as unknown as MessageEvent
    // console.log('[RpcEndpoint] Handling message event:', messageEvent)
    // Handle only valid base messages for this channel
    const data = messageEvent.data
    if (
      data &&
      typeof data === 'object' &&
      'channel' in data &&
      data.channel === this.channelName
    ) {
      this.handleRpcMessage(messageEvent)
    }
  }

  /**
   * Clean up resources and remove from registry
   */
  public override destroy(): void {
    super.destroy()

    // Remove the message event listener
    window.removeEventListener('message', this.handleMessageEvent)

    // Remove from instances registry
    RpcEndpoint.instances.delete(this.channelName)
  }
}
