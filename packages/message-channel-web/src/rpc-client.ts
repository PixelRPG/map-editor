import { RpcClient as CoreRpcClient, MessageEvent, RpcRequest } from '@pixelrpg/message-channel-core';
import { WebKitMessageHandler } from './types/webkit-message-handler';

/**
 * Web implementation of the RPC client 
 * Handles communication with parent window or iframe using direct browser APIs
 */
export class RpcClient extends CoreRpcClient {
    /**
     * WebKit message handler reference, if available
     */
    private webKitHandler: WebKitMessageHandler | null;

    /**
     * Create a new Web RPC client with direct browser API access
     * @param channelName Name of the channel
     */
    constructor(channelName: string) {
        super(channelName);

        // Try to get WebKit message handler if available
        this.webKitHandler = window.webkit?.messageHandlers[channelName] || null;

        // Set up event listener for receiving messages
        window.addEventListener('message', (event) => {
            const messageEvent = event as unknown as MessageEvent;

            // Check if message is intended for this channel
            if (messageEvent.data?.channel === channelName) {
                this.handleRpcMessage(messageEvent);
            }
        });
    }

    /**
     * Send a message to the target window or WebKit
     * @param message The message to send
     */
    protected async postMessage(message: RpcRequest): Promise<void> {
        // Ensure message has channel information
        if (!message.channel) {
            message.channel = this.channelName;
        }

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
     * Clean up resources
     */
    public override destroy(): void {
        super.destroy();

        // Remove the message event listener
        window.removeEventListener('message', this.handleMessageEvent);
    }

    /**
     * Event handler reference for cleanup
     */
    private handleMessageEvent = (event: Event): void => {
        const messageEvent = event as unknown as MessageEvent;
        if (messageEvent.data?.channel === this.channelName) {
            this.handleRpcMessage(messageEvent);
        }
    }
} 