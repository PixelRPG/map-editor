import {
  RpcEndpoint as CoreRpcEndpoint,
  type MessageEvent,
  type RpcRequest,
  type WireRpcResponse,
  type RpcMethodRegistry,
  type RpcMethodHandler,
  type RpcMethodParams,
} from '@pixelrpg/message-channel-core'
import {
  IframeContext,
  type RpcEndpointOptions,
} from './types/iframe-context.ts'
import {
  serializeMessage,
  createTransmissionError,
} from '@pixelrpg/message-channel-core/utils/serialization'

/**
 * Web implementation of the RPC endpoint
 * Handles communication between parent window and iframes using postMessage
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
   * @param options Configuration options for the endpoint
   * @returns An RPC endpoint instance for the specified channel
   */
  public static getInstance<T extends RpcMethodRegistry = RpcMethodRegistry>(
    channelName: string,
    options: RpcEndpointOptions,
  ): RpcEndpoint<T> {
    const key = `${channelName}-${options.context}`
    if (!this.instances.has(key)) {
      this.instances.set(key, new RpcEndpoint<T>(channelName, options))
    }
    return this.instances.get(key)!
  }

  /**
   * Communication context (parent or child)
   */
  private readonly context: IframeContext

  /**
   * Target origin for postMessage
   */
  private readonly targetOrigin: string

  /**
   * Target iframe element (when in parent context)
   */
  private readonly targetIframe?: HTMLIFrameElement

  /**
   * Create a new Web RPC endpoint for iframe communication
   * Use RpcEndpoint.getInstance() instead of calling the constructor directly
   * @param channelName Name of the channel
   * @param options Configuration options for the endpoint
   */
  protected constructor(channelName: string, options: RpcEndpointOptions) {
    super(channelName)

    this.context = options.context
    this.targetOrigin = options.targetOrigin || '*'
    this.targetIframe = options.targetIframe

    // Validate configuration
    if (this.context === IframeContext.PARENT && !this.targetIframe) {
      console.warn('RpcEndpoint: targetIframe is required for parent context')
    }

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
   * Send an RPC request or response message using postMessage
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
      if (this.context === IframeContext.PARENT && this.targetIframe) {
        // Send message to the iframe
        if (this.targetIframe.contentWindow) {
          // Use standardized serialization for consistency
          const serializedMessage = serializeMessage(message)
          const parsedMessage = JSON.parse(serializedMessage) // Ensure clean object
          this.targetIframe.contentWindow.postMessage(
            parsedMessage,
            this.targetOrigin,
          )
          return
        } else {
          throw new Error('Target iframe contentWindow not available')
        }
      } else if (this.context === IframeContext.CHILD) {
        // Send message to parent window
        // Use standardized serialization for consistency
        const serializedMessage = serializeMessage(message)
        const parsedMessage = JSON.parse(serializedMessage) // Ensure clean object
        window.parent.postMessage(parsedMessage, this.targetOrigin)
        return
      } else {
        throw new Error('Invalid context or missing target')
      }
    } catch (error) {
      console.error('Error sending message from Web:', error)
      const transmissionError = createTransmissionError(error, 'Web iframe')
      throw new Error(transmissionError.message)
    }
  }

  /**
   * Event handler for incoming messages
   */
  private handleMessageEvent = (event: Event): void => {
    const messageEvent = event as unknown as MessageEvent
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
    const key = `${this.channelName}-${this.context}`
    RpcEndpoint.instances.delete(key)
  }
}
