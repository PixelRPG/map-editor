import { type MessageEvent, type MessageEventHandler } from '@pixelrpg/message-channel-core';
import { IframeContext, type RpcEndpointOptions } from './types/iframe-context.ts';

/**
 * Web implementation of a message channel for iframe communication
 * Handles communication between parent window and iframes 
 */
export class MessageChannel {
    /**
     * Event handler for incoming messages
     */
    public onmessage: MessageEventHandler | null = null;

    /**
     * Target origin for postMessage
     */
    private targetOrigin: string;

    /**
     * Target iframe element (when in parent context)
     */
    private targetIframe?: HTMLIFrameElement;

    /**
     * Current communication context (parent or child)
     */
    private context: IframeContext;

    /**
     * Create a new MessageChannel for iframe communication
     * @param channelName Name of the channel for scoping messages
     * @param options Configuration options for the channel
     */
    constructor(private readonly channelName: string, options: RpcEndpointOptions) {
        this.context = options.context;
        this.targetOrigin = options.targetOrigin || '*';
        this.targetIframe = options.targetIframe;

        // Validate configuration
        if (this.context === IframeContext.PARENT && !this.targetIframe) {
            console.warn('MessageChannel: targetIframe is required for parent context');
        }

        // Listen for incoming messages
        window.addEventListener('message', this.handleMessageEvent);
    }

    /**
     * Post a message to the target window or iframe
     * @param message Message to send
     */
    public postMessage(message: any): void {
        // Add channel name to the message to scope it
        const scopedMessage = {
            ...message,
            channel: this.channelName
        };

        if (this.context === IframeContext.PARENT && this.targetIframe) {
            // Check if iframe is loaded and has contentWindow
            if (this.targetIframe.contentWindow) {
                this.targetIframe.contentWindow.postMessage(scopedMessage, this.targetOrigin);
            } else {
                console.error('MessageChannel: Cannot send message, iframe contentWindow is not available');
            }
        } else if (this.context === IframeContext.CHILD) {
            // Send message to parent window
            window.parent.postMessage(scopedMessage, this.targetOrigin);
        } else {
            console.error('MessageChannel: Cannot send message, invalid context or missing target');
        }
    }

    /**
     * Handle incoming message events
     */
    private handleMessageEvent = (event: Event): void => {
        const messageEvent = event as unknown as MessageEvent;

        // Check if the message is for this channel
        if (messageEvent.data?.channel === this.channelName) {
            // If an onmessage handler is registered, call it with the message event
            if (this.onmessage) {
                this.onmessage(messageEvent);
            }
        }
    };

    /**
     * Check if the communication channel is ready
     */
    public isReady(): boolean {
        if (this.context === IframeContext.PARENT) {
            return !!this.targetIframe?.contentWindow;
        } else {
            return window.parent !== window;
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        window.removeEventListener('message', this.handleMessageEvent);
        this.onmessage = null;
    }
} 