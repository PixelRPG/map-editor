// TODO: Move to package messages-common

import { EventDispatcher } from "../event-dispatcher"
import type { Message, MessageEvent, MessageFile, MessageText, EventListener } from "./index.ts"
import { proxy } from 'valtio/vanilla'

export abstract class BaseMessageService<S extends object> {

    events = new EventDispatcher()

    state: S

    constructor(protected readonly messageHandlerName: string, state: S) {
        this.state = proxy(state)
    }

    abstract send(message: Message): void

    on(eventName: string, callback: EventListener) {
        this.events.on(`${this.messageHandlerName}:${eventName}`, callback)
    }

    once(eventName: string, callback: EventListener) {
        this.events.once(`${this.messageHandlerName}:${eventName}`, callback)
    }

    off(eventName: string, callback: EventListener) {
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

    onEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>) {
        this.on(`event:${subEventName}`, callback)
    }

    onceEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>) {
        this.once(`event:${subEventName}`, callback)
    }

    offEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>) {
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

