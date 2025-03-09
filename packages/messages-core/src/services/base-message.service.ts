// TODO: Move to services/

import { EventDispatcher } from "../event-dispatcher.ts"
import type { Message, EventListener } from "../types/index.ts"

/**
 * Base message service for handling communication between components
 */
export abstract class BaseMessageService<T extends Message> {
    /**
     * Event dispatcher for handling message events
     */
    events = new EventDispatcher()

    /**
     * Create a new base message service
     * @param messageHandlerName Name of the message handler
     */
    constructor(protected readonly messageHandlerName: string) { }

    /**
     * Send a message
     * @param message Message to send
     */
    abstract send(message: T): void

    /**
     * Register a listener for a specific event
     * @param eventName Name of the event
     * @param callback Callback function
     */
    on<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.on(`${this.messageHandlerName}:${eventName}`, callback)
    }

    /**
     * Register a listener for a specific event that will be called only once
     * @param eventName Name of the event
     * @param callback Callback function
     */
    once<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.once(`${this.messageHandlerName}:${eventName}`, callback)
    }

    /**
     * Remove a listener for a specific event
     * @param eventName Name of the event
     * @param callback Callback function
     */
    off<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.off(`${this.messageHandlerName}:${eventName}`, callback)
    }

    /**
     * Receive a message and dispatch it to the appropriate listeners
     * @param message Message to receive
     */
    protected receive(message: T) {
        this.events.dispatch(`${this.messageHandlerName}:${message.type}`, message)
    }

    /**
     * Initialize the receiver
     */
    protected abstract initReceiver(): void
}

