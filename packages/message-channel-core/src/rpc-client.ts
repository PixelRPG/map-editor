import { type MessageEvent, EventDispatcher } from "./polyfills/index.ts";
import { RpcRequest, BaseMessage, RpcMessageType, HandlerFunction } from "./types/index";
import { createRpcRequest, isRpcResponse } from "./utils/message";


/**
 * Type for pending request objects
 * TODO: Move to ./types/pending-request.ts
 */
interface PendingRequest<T = any> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Base class for RPC clients
 * Provides the core functionality for sending requests and handling responses
 * @template TMessage Type of messages that can be sent via sendMessage
 */
export abstract class RpcClient<TMessage extends BaseMessage = BaseMessage> {
    /**
     * Map of pending requests by their ID
     */
    private pendingRequests = new Map<string, PendingRequest<any>>();

    /**
     * Event dispatcher for raw messages
     */
    public readonly events = new EventDispatcher<RpcMessageType>();

    /**
     * Message counter for unique IDs
     */
    private messageCounter = 0;

    /**
     * Default timeout for requests in milliseconds
     */
    private defaultTimeoutMs = 30000;

    /**
     * Create a new RPC client
     * @param channelName Name of the channel for scoping messages
     */
    constructor(protected readonly channelName: string) { }

    /**
     * Register a handler function that can be called by the server
     * This is an abstract method that should be implemented by platform-specific subclasses
     * @param methodName Name of the method to register
     * @param handler Function to handle the method call
     */
    public abstract registerHandler<TParams = unknown, TResult = unknown>(
        methodName: string,
        handler: HandlerFunction<TParams, TResult>
    ): void;

    /**
     * Unregister a previously registered handler
     * This is an abstract method that should be implemented by platform-specific subclasses
     * @param methodName Name of the method to unregister
     */
    public abstract unregisterHandler(methodName: string): void;

    /**
     * Send a standard message (not an RPC request) to the target
     * This is used for events and notifications where no response is expected
     * @param message The message to send
     */
    public abstract sendMessage(message: TMessage): Promise<void>;

    /**
     * Send an RPC request and wait for the response
     * @param method Method name to call
     * @param params Optional parameters to pass
     * @param timeoutMs Timeout in milliseconds (defaults to 30000)
     */
    public async sendRequest<TParams = unknown, TResult = unknown>(
        method: string,
        params?: TParams,
        timeoutMs?: number
    ): Promise<TResult> {
        const id = `${this.channelName}-${++this.messageCounter}`;
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
     * Handle an incoming message event
     * @param event The message event to handle
     */
    protected handleRpcMessage(event: MessageEvent): void {
        // Extract the message data
        const message = event.data;

        // Check if it's a response and has a valid ID
        if (isRpcResponse(message)) {
            const pendingRequest = this.pendingRequests.get(message.id);

            if (pendingRequest) {
                // Clear the timeout and remove from pending requests
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
        }
    }

    /**
     * Abstract method to send a message
     * To be implemented by platform-specific subclasses
     */
    protected abstract postMessage(message: RpcRequest): Promise<void>;

    /**
     * Clear any pending requests and clean up resources
     */
    public destroy(): void {
        // Clear all timeouts and reject pending requests
        for (const [id, { reject, timeoutId }] of this.pendingRequests.entries()) {
            clearTimeout(timeoutId);
            reject(new Error('Client destroyed'));
            this.pendingRequests.delete(id);
        }
    }
} 