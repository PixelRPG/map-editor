import { RpcClient as CoreRpcClient, MessageEvent, RpcRequest } from '@pixelrpg/message-channel-core';
import { MessageChannel } from './message-channel';

/**
 * Web implementation of the RPC client 
 * Handles communication with parent window or iframe
 */
export class RpcClient extends CoreRpcClient {
    /**
     * The underlying message channel for communication
     */
    private messageChannel: MessageChannel;

    /**
     * Create a new Web RPC client
     * @param channelName Name of the channel
     * @param targetWindow Window to send messages to (defaults to parent)
     * @param targetOrigin Target origin for security (defaults to *)
     */
    constructor(
        channelName: string,
        targetWindow?: Window,
        private readonly targetOrigin: string = '*'
    ) {
        super(channelName);

        // Create the message channel
        this.messageChannel = new MessageChannel(channelName);

        // Set the WebKit handler (only needed if available, will be null in most browser contexts)
        if (window.webkit?.messageHandlers) {
            // Nothing to do, MessageChannel already checks for handlers
        }

        // Setup message handler
        window.addEventListener('message', (event) => {
            // For security, you might want to check the origin
            // if (event.origin !== this.targetOrigin && this.targetOrigin !== '*') {
            //     return;
            // }

            this.handleRpcMessage(event as unknown as MessageEvent);
        });
    }

    /**
     * Send a message to the target window
     * @param message The message to send
     */
    protected async postMessage(message: RpcRequest): Promise<void> {
        // If WebKit handler is available, MessageChannel will use it
        if (window.webkit?.messageHandlers?.[this.channelName]) {
            await this.messageChannel.postMessage(message);
        } else {
            // Otherwise use standard postMessage
            const targetWindow = window.parent;
            targetWindow.postMessage(message, this.targetOrigin);
        }

        return Promise.resolve();
    }

    /**
     * Clean up resources
     */
    public override destroy(): void {
        super.destroy();
        // No need to remove the event listener as it's added to window directly
        // and will be cleaned up when the window is destroyed
    }
} 