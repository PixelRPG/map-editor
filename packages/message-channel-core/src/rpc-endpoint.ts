import { type MessageEvent } from './polyfills/message-event'
import { EventDispatcher } from './polyfills/event-dispatcher'
import { DirectReplyFunction } from './types/handlers'
import { isRpcRequest, isRpcResponse } from './utils/message'
import {
  toMessageResponse,
  fromMessageResponse,
  createMessageRequest,
} from './utils/message-conversion'
import { methodToString } from './utils/type-conversion'
import {
  RpcMethodRegistry,
  RpcMethodHandler,
  RpcResponse,
  RpcMethodParams,
} from './types/rpc'
import { RpcRequest, WireRpcResponse, RpcMessageType } from './types/wire'

/**
 * Interface for pending request handlers
 */
interface PendingRequest<T extends RpcMethodRegistry, K extends keyof T> {
  resolve: (value: T[K]['response'] | PromiseLike<T[K]['response']>) => void
  reject: (reason: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

/**
 * Unified RPC endpoint class that combines server and client functionality
 * Provides core functionality for bidirectional RPC communication
 */
export abstract class RpcEndpoint<
  T extends RpcMethodRegistry = RpcMethodRegistry,
> {
  /**
   * Map of registered method handlers
   */
  protected handlers = new Map<
    string,
    (params: unknown) => Promise<RpcResponse<unknown>> | RpcResponse<unknown>
  >()

  /**
   * Map of pending requests by message ID
   */
  protected pendingRequests = new Map<string, PendingRequest<T, keyof T>>()

  /**
   * Event dispatcher for raw messages
   */
  public readonly events = new EventDispatcher<RpcMessageType>()

  /**
   * Counter for generating unique message IDs
   */
  protected messageCounter = 0

  /**
   * Default timeout for requests in milliseconds
   */
  protected defaultTimeoutMs = 30000

  /**
   * Create a new RPC endpoint
   * @param channelName Name of the channel for scoping messages
   */
  constructor(protected readonly channelName: string) {}

  /**
   * Register a handler function that can be called by the other endpoint
   * @param methodName Name of the method to register
   * @param handler Function to handle the method call
   */
  public registerHandler<K extends keyof T>(
    methodName: K,
    handler: RpcMethodHandler<T, K>,
  ): void {
    this.handlers.set(methodToString(methodName), handler)
  }

  /**
   * Unregister a previously registered handler
   * @param methodName Name of the method to unregister
   */
  public unregisterHandler(methodName: keyof T): void {
    this.handlers.delete(methodToString(methodName))
  }

  /**
   * Handle an incoming message event
   * @param event The message event to handle
   * @param directReply Optional function to directly reply to the request
   */
  protected async handleRpcMessage(
    event: MessageEvent,
    directReply?: DirectReplyFunction,
  ): Promise<void> {
    const message = event.data

    // Handle incoming requests (server functionality)
    if (isRpcRequest(message)) {
      // Check the channel if specified
      if (message.channel && message.channel !== this.channelName) {
        return
      }

      // Dispatch the raw message event
      this.events.dispatch(message)

      // Process the request and prepare response
      await this.processRequest(message, directReply)
      return
    }

    // Handle incoming responses (client functionality)
    if (isRpcResponse(message)) {
      // Check if we have a pending request for this response
      const pendingRequest = this.pendingRequests.get(message.id)
      if (pendingRequest) {
        // Clear the timeout and remove the pending request
        clearTimeout(pendingRequest.timeoutId)
        this.pendingRequests.delete(message.id)

        // Resolve or reject the promise based on the response
        const response = fromMessageResponse(message)
        if (!response.success) {
          pendingRequest.reject(new Error(response.error))
        } else {
          pendingRequest.resolve(response)
        }
      }

      // Dispatch the raw message event
      this.events.dispatch(message)
      return
    }
  }

  /**
   * Process an RPC request and send a response
   * @param request The RPC request to process
   * @param directReply Optional function to directly reply to the request
   */
  protected async processRequest(
    request: RpcRequest,
    directReply?: DirectReplyFunction,
  ): Promise<void> {
    // Find the registered handler
    const { id, method, params } = request
    const handler = this.handlers.get(methodToString(method))

    let response: WireRpcResponse

    try {
      if (!handler) {
        throw new Error(
          `Method '${method}' not found, available methods: ${Array.from(
            this.handlers.keys(),
          ).join(', ')}`,
        )
      }

      // Call the handler and create a success response
      const result = await Promise.resolve(handler(params))
      response = toMessageResponse(id, result)
    } catch (error) {
      // Create an error response
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      response = toMessageResponse(id, {
        success: false,
        error: errorMessage,
      })
    }

    // Set channel if not already set
    if (response.channel === undefined) {
      response.channel = this.channelName
    }

    // Send the response using the preferred method
    if (directReply) {
      // Use direct reply mechanism if available
      directReply(response)
    } else {
      // Fall back to standard message sending
      await this.postMessage(response)
    }
  }

  /**
   * Send an RPC request and wait for the response
   * @param method Method name to call
   * @param params Optional parameters to pass
   * @param timeoutMs Timeout in milliseconds (defaults to defaultTimeoutMs)
   * @returns Promise that resolves with the result or rejects with an error
   */
  public async sendRequest<K extends keyof T>(
    method: K,
    params: RpcMethodParams<T, K>,
    timeoutMs?: number,
  ): Promise<T[K]['response']> {
    // Create a unique ID for this request
    const id = `${this.channelName}-${++this.messageCounter}`

    // Create the request object
    const request = createMessageRequest(id, methodToString(method), params)

    // Set channel if not already set
    if (request.channel === undefined) {
      request.channel = this.channelName
    }

    // Create a promise that will be resolved when we get a response
    return new Promise<T[K]['response']>((resolve, reject) => {
      // Set a timeout to reject the promise if no response is received
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(
            new Error(`Request timeout for method ${methodToString(method)}`),
          )
        }
      }, timeoutMs || this.defaultTimeoutMs)

      // Store the promise resolvers
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
      })

      // Send the request
      this.postMessage(request).catch((error) => {
        clearTimeout(timeoutId)
        this.pendingRequests.delete(id)
        reject(error)
      })
    })
  }

  /**
   * Send an RPC notification (fire-and-forget) without waiting for a response
   * @param method Method name to call
   * @param params Optional parameters to pass
   * @returns Promise that resolves when the notification is sent
   */
  public async sendNotification<K extends keyof T>(
    method: K,
    params: RpcMethodParams<T, K>,
  ): Promise<void> {
    // Create a unique ID for this notification
    const id = `${this.channelName}-${++this.messageCounter}`

    // Create the request object but don't register for a response
    const request = createMessageRequest(id, methodToString(method), params)

    // Set channel if not already set
    if (request.channel === undefined) {
      request.channel = this.channelName
    }

    // Send the notification without waiting for a response
    await this.postMessage(request)
  }

  /**
   * Abstract method to send a message
   * To be implemented by platform-specific subclasses
   * @param message The message to send
   */
  protected abstract postMessage(
    message: RpcRequest | WireRpcResponse,
  ): Promise<void>

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Clear all registered handlers
    this.handlers.clear()

    // Clear all timeouts and reject pending requests
    for (const [id, { reject, timeoutId }] of this.pendingRequests.entries()) {
      clearTimeout(timeoutId)
      reject(new Error('RPC endpoint destroyed'))
      this.pendingRequests.delete(id)
    }
  }
}
