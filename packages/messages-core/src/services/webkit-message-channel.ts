import type { WebKitMessageHandler } from "../types/index.ts";

import { MessageChannel } from "./message-channel.ts";
import { createMessageData } from "../utils/message.ts";

/**
 * WebKit message channel implementation
 * This provides a standard-compliant way to communicate between
 * WebKit WebViews and native code (GJS in our case)
 */
export abstract class WebKitMessageChannel<T = string> extends MessageChannel<T> {
    /**
     * Reference to the WebKit message handler, if available
     */
    protected webKitHandler: WebKitMessageHandler | null = null;

    /**
     * Constructor that takes a channel name identifier
     * @param channelName Name of the message channel
     */
    constructor(channelName: string) {
        super(channelName);
    }

    /**
     * Send a message using WebKit handler
     * @param messageType Type of message to send
     * @param payload Data payload to send
     */
    async postMessage<P = any>(messageType: T, payload: P): Promise<void> {
        if (!this.isHandlerRegistered()) {
            console.warn('WebKit message handler not available');
            return;
        }

        // Create a properly structured message
        const messageData = createMessageData(messageType, payload, this.channelName);

        // Send via WebKit handler
        this.webKitHandler?.postMessage(messageData);
        return Promise.resolve();
    }

    /**
     * Method to check if WebKit messaging is available in this environment
     */
    protected abstract isWebKitAvailable(): boolean;

    /**
     * Method to check if message handler is registered
     */
    protected isHandlerRegistered(): boolean {
        return this.webKitHandler !== null;
    }
} 