import { type MessageEvent, EventDispatcher } from "./polyfills/index.ts";
import { RpcRequest, RpcResponse, RpcMessageType, BaseMessage } from "./types/message";
import { MethodHandler, DirectReplyFunction } from "./types/handlers";
import { createRpcResponse, createRpcErrorResponse, isRpcRequest } from "./utils/message";

/**
 * Base class for RPC servers
 * Provides the core functionality for receiving requests and sending responses
 * @template TMessage Type of messages that can be sent via sendMessage
 */
export abstract class RpcServer<TMessage extends BaseMessage = BaseMessage> {
    /**
     * Map of registered methods
     */
    protected methods = new Map<string, MethodHandler<any, any>>();

    /**
     * Event dispatcher for raw messages
     */
    public readonly events = new EventDispatcher<RpcMessageType>();

    /**
     * Create a new RPC server
     * @param channelName Name of the channel for scoping messages
     */
    constructor(protected readonly channelName: string) { }

    /**
     * Register a method that can be called by clients
     * @param methodName Name of the method to register
     * @param handler Function to handle the method call
     */
    public registerHandler<TParams = unknown, TResult = unknown>(
        methodName: string,
        handler: MethodHandler<TParams, TResult>
    ): void {
        this.methods.set(methodName, handler);
    }

    /**
     * Unregister a previously registered method
     * @param methodName Name of the method to unregister
     */
    public unregisterHandler(methodName: string): void {
        this.methods.delete(methodName);
    }

    /**
     * Handle an incoming message event
     * @param event The message event to handle
     * @param directReply Optional function to directly reply to the request without using postMessage
     */
    protected async handleRpcMessage(event: MessageEvent, directReply?: DirectReplyFunction): Promise<void> {
        // Extract the message data
        const message = event.data;

        // Make sure this is a request message
        if (!isRpcRequest(message)) {
            return;
        }

        // Check the channel if specified
        if (message.channel && message.channel !== this.channelName) {
            return;
        }

        // Dispatch the raw message event
        this.events.dispatch(message);

        // Process the request and prepare response
        await this.processRequest(message, directReply);
    }

    /**
     * Process an RPC request and send a response
     * @param request The RPC request to process
     * @param directReply Optional function to directly reply to the request
     */
    protected async processRequest(request: RpcRequest, directReply?: DirectReplyFunction): Promise<void> {
        // Find the registered method
        const { id, method, params } = request;
        const handler = this.methods.get(method);

        let response: RpcResponse;

        try {
            if (!handler) {
                throw new Error(`Method '${method}' not found`);
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
            // Fall back to standard postMessage
            await this.postMessage(response);
        }
    }

    /**
     * Abstract method to send a message
     * To be implemented by platform-specific subclasses
     */
    protected abstract postMessage(message: RpcResponse): Promise<void>;

    /**
     * Send a message to clients, primarily for event notifications
     * This is used for events where no response is expected
     * @param message The message to send
     */
    public abstract sendMessage(message: TMessage): Promise<void>;

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.methods.clear();
    }

    /**
     * Counter for generating unique message IDs
     */
    protected messageCounter = 0;

    /**
     * Send an RPC request to clients
     * This is a base implementation that subclasses should extend with platform-specific logic
     * @param method Method name to call
     * @param params Optional parameters to pass
     * @throws This base implementation throws an error as it needs to be implemented by platform-specific subclasses
     */
    public async sendRequest<TParams = unknown, TResult = unknown>(
        method: string,
        params?: TParams
    ): Promise<TResult> {
        throw new Error("sendRequest not implemented in base RpcServer class. Platform-specific subclasses must implement this method.");
    }
} 