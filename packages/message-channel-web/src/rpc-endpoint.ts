import {
    RpcEndpoint as CoreRpcEndpoint,
    type MessageEvent,
    type RpcRequest,
    type RpcResponse,
    type MethodHandler,
} from '@pixelrpg/message-channel-core';
import { IframeContext, type RpcEndpointOptions } from './types/iframe-context.ts';

/**
 * Web implementation of the RPC endpoint
 * Handles communication between parent window and iframes using postMessage
 */
export class RpcEndpoint extends CoreRpcEndpoint {
    /**
     * Registry of all created endpoints by channel name
     */
    private static instances: Map<string, RpcEndpoint> = new Map();

    /**
     * Get or create an RPC endpoint for a specific channel
     * @param channelName Name of the channel
     * @param options Configuration options for the endpoint
     * @returns An RPC endpoint instance for the specified channel
     */
    public static getInstance(channelName: string, options: RpcEndpointOptions): RpcEndpoint {
        const key = `${channelName}-${options.context}`;
        if (!this.instances.has(key)) {
            this.instances.set(key, new RpcEndpoint(channelName, options));
        }
        return this.instances.get(key)!;
    }

    /**
     * Communication context (parent or child)
     */
    private readonly context: IframeContext;

    /**
     * Target origin for postMessage
     */
    private readonly targetOrigin: string;

    /**
     * Target iframe element (when in parent context)
     */
    private readonly targetIframe?: HTMLIFrameElement;

    /**
     * Create a new Web RPC endpoint for iframe communication
     * Use RpcEndpoint.getInstance() instead of calling the constructor directly
     * @param channelName Name of the channel
     * @param options Configuration options for the endpoint
     */
    protected constructor(channelName: string, options: RpcEndpointOptions) {
        super(channelName);

        this.context = options.context;
        this.targetOrigin = options.targetOrigin || '*';
        this.targetIframe = options.targetIframe;

        // Validate configuration
        if (this.context === IframeContext.PARENT && !this.targetIframe) {
            console.warn('RpcEndpoint: targetIframe is required for parent context');
        }

        // Set up event listener for receiving messages
        window.addEventListener('message', this.handleMessageEvent);
    }

    /**
     * Register a handler function that can be called by the other endpoint
     * @param methodName Name of the method to register
     * @param handler Function to handle the method call
     */
    public override registerHandler<TParams = unknown, TResult = unknown>(
        methodName: string,
        handler: MethodHandler<TParams, TResult>
    ): void {
        // Call the parent method to register the handler internally
        super.registerHandler(methodName, handler);

        // Also register in the global window.rpcHandlers object for direct access if needed
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
     * Send an RPC request or response message using postMessage
     * @param message The RPC message to send
     */
    protected async postMessage(message: RpcRequest | RpcResponse): Promise<void> {
        // Set channel if not already set
        if (message.channel === undefined) {
            message.channel = this.channelName;
        }

        if (this.context === IframeContext.PARENT && this.targetIframe) {
            // Send message to the iframe
            if (this.targetIframe.contentWindow) {
                this.targetIframe.contentWindow.postMessage(message, this.targetOrigin);
                return Promise.resolve();
            } else {
                return Promise.reject(new Error('Target iframe contentWindow not available'));
            }
        } else if (this.context === IframeContext.CHILD) {
            // Send message to parent window
            window.parent.postMessage(message, this.targetOrigin);
            return Promise.resolve();
        } else {
            return Promise.reject(new Error('Invalid context or missing target'));
        }
    }

    /**
     * Event handler for incoming messages
     */
    private handleMessageEvent = (event: Event): void => {
        const messageEvent = event as unknown as MessageEvent;
        // Handle only messages for this channel
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
        const key = `${this.channelName}-${this.context}`;
        RpcEndpoint.instances.delete(key);
    }
}