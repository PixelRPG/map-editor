// TODO: Move to services/

import { EventDispatcher } from "../event-dispatcher.ts"

import type { Message, MessageEvent, MessageFile, MessageText, EventListener, EventDataMouseMove } from "../types/index.ts"

export abstract class BaseMessageService {

    events = new EventDispatcher()

    constructor(protected readonly messageHandlerName: string) {

    }

    abstract send(message: Message): void

    on<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.on(`${this.messageHandlerName}:${eventName}`, callback)
    }

    once<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.once(`${this.messageHandlerName}:${eventName}`, callback)
    }

    off<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.off(`${this.messageHandlerName}:${eventName}`, callback)
    }

    // Text events

    onMessage(callback: EventListener<MessageText>) {
        this.on('text', callback)
    }

    onceMessage(callback: EventListener<MessageText>) {
        this.once('text', callback)
    }

    offMessage(callback: EventListener<MessageText>) {
        this.off('text', callback)
    }

    // File events

    onFile(callback: EventListener<MessageFile>) {
        this.on('file', callback)
    }

    onceFile(callback: EventListener<MessageFile>) {
        this.once('file', callback)
    }

    offFile(callback: EventListener<MessageFile>) {
        this.off('file', callback)
    }

    // Event events

    onEvent(eventName: 'mouse-move', callback: EventListener<MessageEvent<EventDataMouseMove>>): void
    onEvent(eventName: 'mouse-leave', callback: EventListener<MessageEvent<null>>): void
    onEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.on(`event:${subEventName}`, callback)
    }

    onceEvent(eventName: 'mouse-move', callback: EventListener<MessageEvent<EventDataMouseMove>>): void
    onceEvent(eventName: 'mouse-leave', callback: EventListener<MessageEvent<null>>): void
    onceEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.once(`event:${subEventName}`, callback)
    }

    offEvent(eventName: 'mouse-move', callback: EventListener<MessageEvent<EventDataMouseMove>>): void
    offEvent(eventName: 'mouse-leave', callback: EventListener<MessageEvent<null>>): void
    offEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.off(`event:${subEventName}`, callback)
    }

    protected receive(message: Message) {
        if (message.type === 'event') {
            this.events.dispatch(`${this.messageHandlerName}:${message.type}:${message.data.name}`, message)
        } else {
            this.events.dispatch(`${this.messageHandlerName}:${message.type}`, message)
        }
    }

    protected abstract initReceiver(): void
}

