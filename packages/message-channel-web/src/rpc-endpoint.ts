import {
    RpcEndpoint as CoreRpcEndpoint,
    MessageEvent,
    RpcRequest,
    RpcResponse,
    MethodHandler,
    BaseMessage
} from '@pixelrpg/message-channel-core';
import { WebKitMessageHandler } from './types/webkit-message-handler';

/**
 * Web implementation of the RPC endpoint
 * Handles communication with parent window or iframe using direct browser APIs
 * @template TMessage Type of messages that can be sent via notification methods
 */
export class RpcEndpoint extends CoreRpcEndpoint {
    /**
     * Registry of all created endpoints by channel name
     */
    private static instances: Map<string, RpcEndpoint> = new Map();

    /**
     * Get or create an RPC endpoint for a specific channel
     * @param channelName Name of the channel
     * @returns An RPC endpoint instance for the specified channel
     */
    public static getInstance(channelName: string): RpcEndpoint {
        if (!this.instances.has(channelName)) {
            this.instances.set(channelName, new RpcEndpoint(channelName));
        }
        return this.instances.get(channelName)!;
    }

    /**
     * WebKit message handler reference, if available
     */
    private webKitHandler: WebKitMessageHandler | null;

    /**
     * Create a new Web RPC endpoint with direct browser API access
     * Use RpcEndpoint.getInstance() instead of calling the constructor directly
     * @param channelName Name of the channel
     */
    protected constructor(channelName: string) {
        super(channelName);

        // Try to get WebKit message handler if available
        this.webKitHandler = window.webkit?.messageHandlers[channelName] || null;

        // Set up event listener for receiving messages
        window.addEventListener('message', this.handleMessageEvent);
    }

    /**
     * Register a handler function that can be called by the other endpoint
     * In the web context, this registers the handler in the global window.rpcHandlers object
     * @param methodName Name of the method to register
     * @param handler Function to handle the method call
     */
    public override registerHandler<TParams = unknown, TResult = unknown>(
        methodName: string,
        handler: MethodHandler<TParams, TResult>
    ): void {
        // Call the parent method to register the handler internally
        super.registerHandler(methodName, handler);

        // Also register in the global window.rpcHandlers object for external access
        if (!window.rpcHandlers) {
            window.rpcHandlers = {};
        }

        // Register the handler
        window.rpcHandlers[methodName] = async (params?: unknown) => {
            try {
                // Call the handler and return its result
                return await Promise.resolve(handler(params as TParams));
            } catch (error) {
                // Convert errors to a standard format
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error in RPC handler for method "${methodName}":`, error);

                // Re-throw as an object with message to ensure proper serialization
                throw { message: errorMessage };
            }
        };

        console.debug(`Registered RPC handler for method: ${methodName}`);
    }

    /**
     * Unregister a previously registered handler
     * @param methodName Name of the method to unregister
     */
    public override unregisterHandler(methodName: string): void {
        // Call the parent method to unregister the handler internally
        super.unregisterHandler(methodName);

        // Also unregister from the global window.rpcHandlers object
        if (window.rpcHandlers && window.rpcHandlers[methodName]) {
            delete window.rpcHandlers[methodName];
            console.debug(`Unregistered RPC handler for method: ${methodName}`);
        }
    }

    /**
     * Override the sendNotification method from the base class to implement method/params style notification
     * @param method The method name to call
     * @param params The parameters to send
     */
    public override async sendNotification<TParams = unknown>(
        method: string,
        params?: TParams
    ): Promise<void> {
        return super.sendNotification(method, params);
    }

    /**
     * Internal method to send a message to the target window or WebKit
     * Used by postMessage
     * @param message The message to send
     */
    private async sendMessageInternal(message: RpcRequest | RpcResponse): Promise<void> {
        // Try WebKit handler first if available
        if (this.webKitHandler) {
            try {
                this.webKitHandler.postMessage(message);
                return Promise.resolve();
            } catch (error) {
                console.warn('WebKit postMessage failed:', error);
                // Fall through to window.postMessage
            }
        }

        // Fall back to window.postMessage
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, '*');
            return Promise.resolve();
        } else {
            return Promise.reject(new Error('No valid message target available'));
        }
    }

    /**
     * Send an RPC request or response message
     * @param message The RPC message to send
     */
    protected async postMessage(message: RpcRequest | RpcResponse): Promise<void> {
        // Set channel if not already set
        if (message.channel === undefined) {
            message.channel = this.channelName;
        }

        return this.sendMessageInternal(message);
    }

    /**
     * Event handler for incoming messages
     */
    private handleMessageEvent = (event: Event): void => {
        const messageEvent = event as unknown as MessageEvent;
        console.log('[RpcEndpoint] Handling message event:', messageEvent);
        if (messageEvent.data?.channel === this.channelName) {
            this.handleRpcMessage(messageEvent);
        }
    };

    /**
     * Clean up resources and remove from registry
     */
    public override destroy(): void {
        super.destroy();

        // Remove the message event listener
        window.removeEventListener('message', this.handleMessageEvent);

        // Remove from instances registry
        RpcEndpoint.instances.delete(this.channelName);
    }
} 