import type { MessageEvent } from "../polyfills/message-event.ts";
import type { MessageData, EventListener } from "../types/index.ts";

import { EventDispatcher } from "../polyfills/event-dispatcher.ts";
import { isMessageData } from "../utils/message.ts";


/**
 * Messaging channel based on WHATWG standards for message passing.
 * This provides a unified API for sending and receiving messages between
 * different contexts (GJS and WebView) using web standards.
 */
export abstract class MessageChannel<T = string> {
    /**
     * Event dispatcher for handling message events
     */
    protected events = new EventDispatcher<MessageData<T>>();

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
    constructor(protected readonly channelName: string) {
    }

    /**
     * Send a message through the channel
     * Standard-compliant method that takes type and payload separately
     * @param messageType Type identifier for routing
     * @param payload Actual data to send
     */
    abstract postMessage<P = any>(messageType: T, payload: P): Promise<void>;

    // /**
    //  * Register a listener for a specific message type
    //  * @param messageType Type of message to listen for
    //  * @param callback Function to call when message is received
    //  */
    // on<P = any>(messageType: T, callback: (payload: P) => void) {
    //     const wrappedCallback = (messageData: MessageData<T, P>) => {
    //         callback(messageData.payload);
    //     };
    //     this.events.on(`${this.channelName}:${String(messageType)}`, wrappedCallback as EventListener<MessageData<T, P>>);
    // }

    // /**
    //  * Register a one-time listener for a specific message type
    //  * @param messageType Type of message to listen for
    //  * @param callback Function to call when message is received
    //  */
    // once<P = any>(messageType: T, callback: (payload: P) => void) {
    //     const wrappedCallback = (messageData: MessageData<T, P>) => {
    //         callback(messageData.payload);
    //     };
    //     this.events.once(`${this.channelName}:${String(messageType)}`, wrappedCallback as EventListener<MessageData<T, P>>);
    // }

    // /**
    //  * Remove a listener for a specific message type
    //  * @param messageType Type of message to listen for
    //  * @param callback Function to remove
    //  */
    // off<P = any>(messageType: T, callback: (payload: P) => void) {
    //     // Note: Since we wrap callbacks, this won't work unless we store the wrapped versions
    //     // This is a limitation of this simplified design
    //     const wrappedCallback = (messageData: MessageData<T, P>) => {
    //         callback(messageData.payload);
    //     };
    //     this.events.off(`${this.channelName}:${String(messageType)}`, wrappedCallback as EventListener<MessageData<T, P>>);
    // }

    // /**
    //  * Process a received message and dispatch to appropriate listeners
    //  * @param messageData The received message data
    //  */
    // protected processMessage(messageData: MessageData<T>) {
    //     if (messageData.messageType) {
    //         // Dispatch to type-specific handlers
    //         this.events.dispatch(`${this.channelName}:${String(messageData.messageType)}`, messageData);
    //     }
    // }

    /**
     * Handle incoming standard MessageEvent
     * Extracts our MessageData structure and processes it
     */
    protected handleMessageEvent(event: MessageEvent): void {
        // Check if we have a valid MessageData structure
        const data = event.data;

        // console.log('[MessageChannel] handleMessageEvent', data)

        if (isMessageData(data) && (!data.channel || data.channel === this.channelName)) {
            // Call the standard onmessage handler first if set
            if (this._onmessage) {
                this._onmessage(event);
            }

            // // Then process with our type-routing system
            // this.processMessage(data as MessageData<T>);
        }
    }
} 