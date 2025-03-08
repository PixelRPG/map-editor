// TODO: Move to services/

import { EventDispatcher } from "../event-dispatcher.ts"
import type { Message, EventListener, MessageGeneric } from "../types/index.ts"

/**
 * Base message service for handling communication between components
 */
export abstract class BaseMessageService {
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
    abstract send(message: Message): void

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
     * Register a listener for a generic message
     * @param messageType Type of the message
     * @param callback Callback function
     */
    onGenericMessage<T = any>(messageType: string, callback: EventListener<MessageGeneric<string, T>>) {
        this.on(messageType, callback)
    }

    /**
     * Register a listener for a generic message that will be called only once
     * @param messageType Type of the message
     * @param callback Callback function
     */
    onceGenericMessage<T = any>(messageType: string, callback: EventListener<MessageGeneric<string, T>>) {
        this.once(messageType, callback)
    }

    /**
     * Remove a listener for a generic message
     * @param messageType Type of the message
     * @param callback Callback function
     */
    offGenericMessage<T = any>(messageType: string, callback: EventListener<MessageGeneric<string, T>>) {
        this.off(messageType, callback)
    }

    /**
     * Receive a message and dispatch it to the appropriate listeners
     * @param message Message to receive
     */
    protected receive(message: Message) {
        // For event messages with a name property in data
        // if (message.type === 'event' && message.data && typeof message.data === 'object' && 'name' in message.data) {
        //     this.events.dispatch(`${this.messageHandlerName}:${message.type}:${message.data.name}`, message)
        // } else {
        //     // For all other message types
        //     this.events.dispatch(`${this.messageHandlerName}:${message.type}`, message)
        // }
        this.events.dispatch(`${this.messageHandlerName}:${message.type}`, message)
    }

    /**
     * Initialize the receiver
     */
    protected abstract initReceiver(): void
}

