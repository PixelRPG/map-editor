import type { Window } from "../polyfills/window.ts";
import { MessageChannel } from "./message-channel.ts";
import { createMessageData } from "../utils/message.ts";

/**
 * WHATWG standard window.postMessage implementation
 * This provides cross-context messaging using the standard web API
 */
export abstract class WindowMessageChannel<T = string> extends MessageChannel<T> {
    /**
     * Target window for sending messages
     */
    protected abstract targetWindow: Window | null;

    /**
     * Target origin for security
     */
    protected abstract targetOrigin: string;

    /**
     * Create a new window message channel
     * @param channelName Name of the channel
     */
    constructor(channelName: string) {
        super(channelName);
    }

    /**
     * Send a message using window.postMessage standard API
     * @param messageType Type of message to send
     * @param payload Data payload to send
     */
    async postMessage<P = any>(messageType: T, payload: P): Promise<void> {
        if (!this.targetWindow) {
            throw new Error('No target window available for sending message');
        }

        // Create a properly structured message
        const messageData = createMessageData(messageType, payload, this.channelName);

        // Send using standard postMessage API
        this.targetWindow.postMessage(messageData, this.targetOrigin);
        return Promise.resolve();
    }

    /**
     * Initialize the window message listener
     * When implementing this method, you should add an event listener for 'message'
     * that calls handleMessageEvent
     */
    protected abstract initializeChannel(): void;
} 