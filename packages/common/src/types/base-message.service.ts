// TODO: Move to package messages-common

import { EventDispatcher } from "../event-dispatcher"
import { proxy, subscribe, snapshot, ref } from 'valtio/vanilla'

import type { Message, MessageEvent, MessageFile, MessageText, EventListener, StateChangeOperation, MessageEventStateChanged, EventDataStateChanged } from "./index.ts"


export abstract class BaseMessageService<S extends object> {

    events = new EventDispatcher()

    state: S

    constructor(protected readonly messageHandlerName: string, state: S) {
        this.state = proxy<S>(state)
        this.onStateChange = this.onStateChange.bind(this)
        subscribe(this.state, this.onStateChange)
        this.onEvent('state-changed', (message) => {
            // console.log('state-changed:', message)
            this.state = message.data.data.state
        })
    }

    protected onStateChange(_ops: StateChangeOperation[]) {
        // const snap = snapshot(this.state);
        console.log('state has changed to', this.state)
        const message: MessageEventStateChanged<S> = {
            type: 'event', data: {
                name: 'state-changed', data: {
                    state: this.state,
                    // TODO: Fix `DataCloneError: The object can not be cloned` error
                    // ops
                }
            }
        }
        this.send(message)
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

    onEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
    onEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.on(`event:${subEventName}`, callback)
    }

    onceEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
    onceEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.once(`event:${subEventName}`, callback)
    }

    offEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
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

