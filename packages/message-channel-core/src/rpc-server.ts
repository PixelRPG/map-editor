import { type MessageEvent, EventDispatcher } from "./polyfills/index.ts";
import { RpcRequest, RpcResponse, RpcMessageType } from "./types/message";
import { createRpcResponse, createRpcErrorResponse, isRpcRequest } from "./utils/message";

/**
 * Type for method handlers
 */
export type MethodHandler = (params?: unknown) => Promise<unknown>;

/**
 * Base class for RPC servers
 * Provides the core functionality for receiving requests and sending responses
 */
export abstract class RpcServer {
    /**
     * Map of registered methods
     */
    private methods = new Map<string, MethodHandler>();

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
    public registerMethod(methodName: string, handler: MethodHandler): void {
        this.methods.set(methodName, handler);
    }

    /**
     * Unregister a previously registered method
     * @param methodName Name of the method to unregister
     */
    public unregisterMethod(methodName: string): void {
        this.methods.delete(methodName);
    }

    /**
     * Handle an incoming message event
     * @param event The message event to handle
     */
    protected async handleRpcMessage(event: MessageEvent): Promise<void> {
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

        // Find the registered method
        const { id, method, params } = message;
        const handler = this.methods.get(method);

        let response: RpcResponse;

        try {
            if (!handler) {
                throw new Error(`Method '${method}' not found`);
            }

            // Call the handler and create a success response
            const result = await handler(params);
            response = createRpcResponse(id, result, this.channelName);
        } catch (error) {
            // Create an error response
            const errorMessage = error instanceof Error ? error.message : String(error);
            response = createRpcErrorResponse(id, -32000, errorMessage, this.channelName);
        }

        // Send the response back
        await this.postMessage(response);
    }

    /**
     * Abstract method to send a message
     * To be implemented by platform-specific subclasses
     */
    protected abstract postMessage(message: RpcResponse): Promise<void>;

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.methods.clear();
    }
} 