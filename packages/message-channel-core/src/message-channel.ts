import type { MessageEvent } from "./polyfills/message-event.ts";

/**
 * Messaging channel based on WHATWG standards for message passing.
 * This provides a unified API for sending and receiving messages between
 * different contexts (GJS and WebView) using web standards.
 */
export abstract class MessageChannel {
    /**
     * Handler for message events (standard DOM pattern)
     */
    private _onmessage: ((event: MessageEvent) => void) | null = null;

    /**
     * Standard onmessage property following the DOM pattern
     */
    get onmessage(): ((event: MessageEvent) => void) | null {
        return this._onmessage;
    }

    /**
     * Set message handler following standard DOM pattern
     * This receives the raw MessageEvent, not our custom type
     */
    set onmessage(handler: ((event: MessageEvent) => void) | null) {
        this._onmessage = handler;
    }

    /**
     * Create a new messaging channel with the given channel name
     * @param channelName Identifier for this communication channel
     */
    constructor(protected readonly channelName: string) { }

    /**
     * Send a message through the channel
     * Standard-compliant method that takes a single data parameter
     * @param data Any data to send via the channel
     */
    abstract postMessage(data: any): Promise<void>;

    /**
     * Handle incoming standard MessageEvent
     */
    protected handleMessageEvent(event: MessageEvent): void {
        if ((!event.data.channel || event.data.channel === this.channelName)) {
            // Call the standard onmessage handler if set
            if (this._onmessage) {
                this._onmessage(event);
            }
        }
    }
} 