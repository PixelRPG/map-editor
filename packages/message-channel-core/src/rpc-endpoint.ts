import { type MessageEvent, EventDispatcher } from "./polyfills/index.ts";
import { RpcRequest, RpcResponse, RpcMessageType, BaseMessage } from "./types/message";
import { MethodHandler, DirectReplyFunction } from "./types/handlers";
import { createRpcResponse, createRpcErrorResponse, isRpcRequest, isRpcResponse, createRpcRequest } from "./utils/message";

/**
 * Interface for pending request handlers
 */
interface PendingRequest<T = any> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Unified RPC endpoint class that combines server and client functionality
 * Provides core functionality for bidirectional RPC communication
 * @template TMessage Type of messages that can be sent via sendLegacyNotification
 */
export abstract class RpcEndpoint {
    /**
     * Map of registered method handlers
     */
    protected handlers = new Map<string, MethodHandler<any, any>>();

    /**
     * Map of pending requests by message ID
     */
    protected pendingRequests = new Map<string, PendingRequest<any>>();

    /**
     * Event dispatcher for raw messages
     */
    public readonly events = new EventDispatcher<RpcMessageType>();

    /**
     * Counter for generating unique message IDs
     */
    protected messageCounter = 0;

    /**
     * Default timeout for requests in milliseconds
     */
    protected defaultTimeoutMs = 30000;

    /**
     * Create a new RPC endpoint
     * @param channelName Name of the channel for scoping messages
     */
    constructor(protected readonly channelName: string) { }

    /**
     * Register a handler function that can be called by the other endpoint
     * @param methodName Name of the method to register
     * @param handler Function to handle the method call
     */
    public registerHandler<TParams = unknown, TResult = unknown>(
        methodName: string,
        handler: MethodHandler<TParams, TResult>
    ): void {
        this.handlers.set(methodName, handler);
    }

    /**
     * Unregister a previously registered handler
     * @param methodName Name of the method to unregister
     */
    public unregisterHandler(methodName: string): void {
        this.handlers.delete(methodName);
    }

    /**
     * Handle an incoming message event
     * @param event The message event to handle
     * @param directReply Optional function to directly reply to the request
     */
    protected async handleRpcMessage(event: MessageEvent, directReply?: DirectReplyFunction): Promise<void> {
        const message = event.data;

        // Handle incoming requests (server functionality)
        if (isRpcRequest(message)) {
            // Check the channel if specified
            if (message.channel && message.channel !== this.channelName) {
                return;
            }

            // Dispatch the raw message event
            this.events.dispatch(message);

            // Process the request and prepare response
            await this.processRequest(message, directReply);
            return;
        }

        // Handle incoming responses (client functionality)
        if (isRpcResponse(message)) {
            // Check if we have a pending request for this response
            const pendingRequest = this.pendingRequests.get(message.id);
            if (pendingRequest) {
                // Clear the timeout and remove the pending request
                clearTimeout(pendingRequest.timeoutId);
                this.pendingRequests.delete(message.id);

                // Resolve or reject the promise based on the response
                if (message.error) {
                    pendingRequest.reject(new Error(message.error.message));
                } else {
                    pendingRequest.resolve(message.result);
                }
            }

            // Dispatch the raw message event
            this.events.dispatch(message);
            return;
        }
    }

    /**
     * Process an RPC request and send a response
     * @param request The RPC request to process
     * @param directReply Optional function to directly reply to the request
     */
    protected async processRequest(request: RpcRequest, directReply?: DirectReplyFunction): Promise<void> {
        // Find the registered handler
        const { id, method, params } = request;
        const handler = this.handlers.get(method);

        let response: RpcResponse;

        try {
            if (!handler) {
                throw new Error(`Method '${method}' not found, available methods: ${Array.from(this.handlers.keys()).join(', ')}`);
            }

            // Call the handler and create a success response
            const result = await Promise.resolve(handler(params));
            response = createRpcResponse(id, result, this.channelName);
        } catch (error) {
            // Create an error response
            const errorMessage = error instanceof Error ? error.message : String(error);
            response = createRpcErrorResponse(id, -32000, errorMessage, this.channelName);
        }

        // Send the response using the preferred method
        if (directReply) {
            // Use direct reply mechanism if available
            directReply(response);
        } else {
            // Fall back to standard message sending
            await this.postMessage(response);
        }
    }

    /**
     * Send an RPC request and wait for the response
     * @param method Method name to call
     * @param params Optional parameters to pass
     * @param timeoutMs Timeout in milliseconds (defaults to defaultTimeoutMs)
     * @returns Promise that resolves with the result or rejects with an error
     */
    public async sendRequest<TParams = unknown, TResult = unknown>(
        method: string,
        params?: TParams,
        timeoutMs?: number
    ): Promise<TResult> {
        // Create a unique ID for this request
        const id = `${this.channelName}-${++this.messageCounter}`;

        // Create the request object
        const request = createRpcRequest(method, params, id, this.channelName);

        // Create a promise that will be resolved when we get a response
        return new Promise<TResult>((resolve, reject) => {
            // Set a timeout to reject the promise if no response is received
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout for method ${method}`));
                }
            }, timeoutMs || this.defaultTimeoutMs);

            // Store the promise resolvers
            this.pendingRequests.set(id, {
                resolve,
                reject,
                timeoutId
            });

            // Send the request
            this.postMessage(request).catch(error => {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(id);
                reject(error);
            });
        });
    }

    /**
     * Send an RPC notification (fire-and-forget) without waiting for a response
     * @param method Method name to call
     * @param params Optional parameters to pass
     * @returns Promise that resolves when the notification is sent
     */
    public async sendNotification<TParams = unknown>(
        method: string,
        params?: TParams
    ): Promise<void> {
        // Create a unique ID for this notification
        const id = `${this.channelName}-${++this.messageCounter}`;

        // Create the request object but don't register for a response
        const request = createRpcRequest(method, params, id, this.channelName);

        // Send the notification without waiting for a response
        await this.postMessage(request);
    }

    /**
     * Abstract method to send a message 
     * To be implemented by platform-specific subclasses
     * @param message The message to send
     */
    protected abstract postMessage(message: RpcRequest | RpcResponse): Promise<void>;

    /**
     * Clean up resources
     */
    public destroy(): void {
        // Clear all registered handlers
        this.handlers.clear();

        // Clear all timeouts and reject pending requests
        for (const [id, { reject, timeoutId }] of this.pendingRequests.entries()) {
            clearTimeout(timeoutId);
            reject(new Error('RPC endpoint destroyed'));
            this.pendingRequests.delete(id);
        }
    }
} 