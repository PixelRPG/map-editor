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
 * @template TMessage Type of messages that can be sent via sendMessage
 */
export class RpcEndpoint<TMessage extends BaseMessage = BaseMessage> extends CoreRpcEndpoint<TMessage> {
    /**
     * WebKit message handler reference, if available
     */
    private webKitHandler: WebKitMessageHandler | null;

    /**
     * Create a new Web RPC endpoint with direct browser API access
     * @param channelName Name of the channel
     */
    constructor(channelName: string) {
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
     * Send a standard message (not an RPC request) to the target
     * This is used for events and notifications where no response is expected
     * @param message The message to send
     */
    public async sendMessage(message: TMessage): Promise<void> {
        // Set channel if not already set
        if (message.channel === undefined) {
            message.channel = this.channelName;
        }

        return this.sendMessageInternal(message);
    }

    /**
     * Internal method to send a message to the target window or WebKit
     * Used by both sendMessage and postMessage
     * @param message The message to send
     */
    private async sendMessageInternal(message: TMessage | RpcRequest | RpcResponse): Promise<void> {
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
        if (messageEvent.data?.channel === this.channelName) {
            this.handleRpcMessage(messageEvent);
        }
    };

    /**
     * Clean up resources
     */
    public override destroy(): void {
        super.destroy();

        // Remove the message event listener
        window.removeEventListener('message', this.handleMessageEvent);
    }
} 